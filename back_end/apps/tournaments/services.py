from __future__ import annotations

from collections import defaultdict
from datetime import datetime, time, timedelta
import random

from django.db import transaction

from apps.gyms.models import Field

from .models import Match, Team, Tournament, TournamentGroup


GROUP_STAGE = 'group'
SLOT_START_HOUR = 9
SLOT_DURATION = timedelta(hours=1)
SLOTS_PER_DAY = 12
KNOCKOUT_PROGRESS_SCORES = {
    'knockout_match_3_loser': 3,
    'knockout_match_2_loser': 2,
    'group_stage_only': 1,
}


APPROVED_TEAM_STATUSES = ('approved', 'confirmed')


def create_groups(*, tournament: Tournament):
    groups = []
    for order, name in enumerate(('A', 'B'), start=1):
        group, _created = TournamentGroup.objects.get_or_create(
            tournament=tournament,
            name=name,
            defaults={'order': order},
        )
        if group.order != order:
            group.order = order
            group.save(update_fields=['order'])
        groups.append(group)
    return sorted(groups, key=lambda item: item.order)


def assign_teams_to_groups(*, tournament: Tournament):
    groups = create_groups(tournament=tournament)
    teams = list(
        tournament.teams.filter(status__in=APPROVED_TEAM_STATUSES).order_by('created_at', 'team_id')
    )
    if len(teams) < 4:
        raise ValueError('At least 4 owner-approved teams are required to start this format.')

    assignments = {groups[0].name: [], groups[1].name: []}
    for index, team in enumerate(teams):
        target_group = groups[index % 2]
        if team.group_id != target_group.group_id or team.final_rank is not None:
            team.group = target_group
            team.final_rank = None
            team.save(update_fields=['group', 'final_rank'])
        assignments[target_group.name].append(team)

    Team.objects.filter(
        tournament=tournament,
    ).exclude(
        team_id__in=[team.team_id for team in teams]
    ).update(group=None, final_rank=None)
    return assignments


def _available_schedule_slots(*, tournament: Tournament):
    fields = list(Field.objects.filter(gym=tournament.gym).order_by('field_id'))
    if not fields:
        raise ValueError('Tournament gym must have at least one field to generate matches.')

    total_days = (tournament.end_date - tournament.start_date).days + 1
    if total_days <= 0:
        raise ValueError('Tournament schedule window is invalid.')

    for day_offset in range(total_days):
        match_date = tournament.start_date + timedelta(days=day_offset)
        for slot_index in range(SLOTS_PER_DAY):
            start_dt = datetime.combine(match_date, time(hour=SLOT_START_HOUR)) + (slot_index * SLOT_DURATION)
            end_dt = start_dt + SLOT_DURATION
            for field in fields:
                yield field, match_date, start_dt.time(), end_dt.time()


def _next_schedule_slot(*, tournament: Tournament, occupied_keys):
    for field, match_date, start_time, end_time in _available_schedule_slots(tournament=tournament):
        key = (field.field_id, match_date, start_time)
        if key in occupied_keys:
            continue
        occupied_keys.add(key)
        return field, match_date, start_time, end_time
    raise ValueError('Tournament date range does not have enough field capacity for generated matches.')


def generate_group_matches(*, tournament: Tournament):
    groups = list(tournament.groups.order_by('order', 'group_id'))
    occupied_keys = {
        (match.field_id, match.match_date, match.start_time)
        for match in tournament.matches.select_related('field').all()
    }
    created_matches = []
    stage_order = 1

    for group in groups:
        teams = list(group.teams.filter(status__in=APPROVED_TEAM_STATUSES).order_by('created_at', 'team_id'))
        for index, team1 in enumerate(teams):
            for team2 in teams[index + 1:]:
                match = Match.objects.filter(
                    tournament=tournament,
                    stage=GROUP_STAGE,
                    group=group,
                    team1=team1,
                    team2=team2,
                ).first()
                if match is None:
                    field, match_date, start_time, end_time = _next_schedule_slot(
                        tournament=tournament,
                        occupied_keys=occupied_keys,
                    )
                    match = Match.objects.create(
                        tournament=tournament,
                        group=group,
                        field=field,
                        team1=team1,
                        team2=team2,
                        stage=GROUP_STAGE,
                        stage_order=stage_order,
                        match_date=match_date,
                        start_time=start_time,
                        end_time=end_time,
                    )
                    created_matches.append(match)
                stage_order += 1
    return created_matches


def _base_team_metrics(team: Team):
    return {
        'team': team,
        'team_id': team.team_id,
        'team_name': team.team_name,
        'played': 0,
        'wins': 0,
        'draws': 0,
        'losses': 0,
        'goals_for': 0,
        'goals_against': 0,
        'goal_difference': 0,
        'points': 0,
        '_tiebreak_random': random.random(),
    }


def _apply_match_metrics(*, metrics, match: Match):
    if match.status != 'played':
        return

    team1_metrics = metrics[match.team1_id]
    team2_metrics = metrics[match.team2_id]
    team1_score = match.team1_score or 0
    team2_score = match.team2_score or 0

    for team_metrics, goals_for, goals_against in (
        (team1_metrics, team1_score, team2_score),
        (team2_metrics, team2_score, team1_score),
    ):
        team_metrics['played'] += 1
        team_metrics['goals_for'] += goals_for
        team_metrics['goals_against'] += goals_against
        team_metrics['goal_difference'] = team_metrics['goals_for'] - team_metrics['goals_against']

    if team1_score > team2_score:
        team1_metrics['wins'] += 1
        team1_metrics['points'] += 3
        team2_metrics['losses'] += 1
    elif team2_score > team1_score:
        team2_metrics['wins'] += 1
        team2_metrics['points'] += 3
        team1_metrics['losses'] += 1
    else:
        team1_metrics['draws'] += 1
        team2_metrics['draws'] += 1
        team1_metrics['points'] += 1
        team2_metrics['points'] += 1


def _head_to_head_metrics(*, group: TournamentGroup, team_ids):
    metrics = {
        team_id: {
            'points': 0,
            'goal_difference': 0,
            'goals_for': 0,
        }
        for team_id in team_ids
    }
    matches = group.matches.filter(status='played', team1_id__in=team_ids, team2_id__in=team_ids)
    for match in matches:
        team1_score = match.team1_score or 0
        team2_score = match.team2_score or 0
        metrics[match.team1_id]['goals_for'] += team1_score
        metrics[match.team1_id]['goal_difference'] += team1_score - team2_score
        metrics[match.team2_id]['goals_for'] += team2_score
        metrics[match.team2_id]['goal_difference'] += team2_score - team1_score
        if team1_score > team2_score:
            metrics[match.team1_id]['points'] += 3
        elif team2_score > team1_score:
            metrics[match.team2_id]['points'] += 3
        else:
            metrics[match.team1_id]['points'] += 1
            metrics[match.team2_id]['points'] += 1
    return metrics


def _resolve_tied_subset(*, group: TournamentGroup, subset):
    if len(subset) <= 1:
        return subset

    head_to_head = _head_to_head_metrics(group=group, team_ids=[item['team_id'] for item in subset])
    return sorted(
        subset,
        key=lambda item: (
            -head_to_head[item['team_id']]['points'],
            -head_to_head[item['team_id']]['goal_difference'],
            -head_to_head[item['team_id']]['goals_for'],
            item['_tiebreak_random'],
        ),
    )


def calculate_group_standings(*, tournament: Tournament):
    standings = {}
    for group in tournament.groups.order_by('order', 'group_id'):
        metrics = {
            team.team_id: _base_team_metrics(team)
            for team in group.teams.order_by('created_at', 'team_id')
        }
        matches = list(group.matches.select_related('team1', 'team2').order_by('match_date', 'start_time', 'match_id'))
        for match in matches:
            _apply_match_metrics(metrics=metrics, match=match)

        ranked = sorted(
            metrics.values(),
            key=lambda item: (
                -item['points'],
                -item['goal_difference'],
                -item['goals_for'],
                item['team_id'],
            ),
        )

        final_ranked = []
        index = 0
        while index < len(ranked):
            current = ranked[index]
            subset = [current]
            index += 1
            while index < len(ranked):
                candidate = ranked[index]
                if (
                    candidate['points'],
                    candidate['goal_difference'],
                    candidate['goals_for'],
                ) != (
                    current['points'],
                    current['goal_difference'],
                    current['goals_for'],
                ):
                    break
                subset.append(candidate)
                index += 1
            final_ranked.extend(_resolve_tied_subset(group=group, subset=subset))

        for position, item in enumerate(final_ranked, start=1):
            item['position'] = position

        standings[group.name] = final_ranked
    return standings


def get_top_teams(*, tournament: Tournament):
    standings = calculate_group_standings(tournament=tournament)
    try:
        return {
            'A1': standings['A'][0]['team'],
            'A2': standings['A'][1]['team'],
            'B1': standings['B'][0]['team'],
            'B2': standings['B'][1]['team'],
        }
    except (KeyError, IndexError):
        raise ValueError('Each group must have at least two ranked teams before knockout can be generated.')


def _group_stage_complete(*, tournament: Tournament):
    return not tournament.matches.filter(stage=GROUP_STAGE).exclude(status='played').exists()


def _mark_group_eliminations(*, tournament: Tournament, top_teams):
    qualifier_ids = {team.team_id for team in top_teams.values()}
    for team in tournament.teams.filter(status__in=APPROVED_TEAM_STATUSES):
        if team.team_id not in qualifier_ids and team.status != 'eliminated':
            team.status = 'eliminated'
            team.save(update_fields=['status'])


def ensure_match_three(*, tournament: Tournament):
    match1 = Match.objects.filter(tournament=tournament, stage='knockout_match_1', status='played').first()
    match2 = Match.objects.filter(tournament=tournament, stage='knockout_match_2', status='played').first()
    if match1 is None or match2 is None:
        return None

    existing = Match.objects.filter(tournament=tournament, stage='knockout_match_3').first()
    if existing is not None:
        return existing

    loser_match1 = match1.team1 if match1.winner_team_id == match1.team2_id else match1.team2
    winner_match2 = match2.winner_team
    occupied_keys = {
        (match.field_id, match.match_date, match.start_time)
        for match in tournament.matches.select_related('field').all()
    }
    field, match_date, start_time, end_time = _next_schedule_slot(
        tournament=tournament,
        occupied_keys=occupied_keys,
    )
    return Match.objects.create(
        tournament=tournament,
        field=field,
        team1=winner_match2,
        team2=loser_match1,
        stage='knockout_match_3',
        stage_order=102,
        match_date=match_date,
        start_time=start_time,
        end_time=end_time,
    )


def generate_knockout_matches(*, tournament: Tournament):
    if not _group_stage_complete(tournament=tournament):
        return []

    top_teams = get_top_teams(tournament=tournament)
    occupied_keys = {
        (match.field_id, match.match_date, match.start_time)
        for match in tournament.matches.select_related('field').all()
    }
    created_matches = []
    stage_map = {
        'knockout_match_1': (top_teams['A1'], top_teams['B1'], 100),
        'knockout_match_2': (top_teams['A2'], top_teams['B2'], 101),
    }

    for stage, (team1, team2, stage_order) in stage_map.items():
        match = Match.objects.filter(tournament=tournament, stage=stage).first()
        if match is None:
            field, match_date, start_time, end_time = _next_schedule_slot(
                tournament=tournament,
                occupied_keys=occupied_keys,
            )
            match = Match.objects.create(
                tournament=tournament,
                field=field,
                team1=team1,
                team2=team2,
                stage=stage,
                stage_order=stage_order,
                match_date=match_date,
                start_time=start_time,
                end_time=end_time,
            )
            created_matches.append(match)

    _mark_group_eliminations(tournament=tournament, top_teams=top_teams)
    ensure_match_three(tournament=tournament)
    return created_matches


def _knockout_status_map(*, tournament: Tournament):
    status_map = defaultdict(lambda: 'group_stage_only')
    match1 = Match.objects.filter(tournament=tournament, stage='knockout_match_1', status='played').first()
    match2 = Match.objects.filter(tournament=tournament, stage='knockout_match_2', status='played').first()
    match3 = Match.objects.filter(tournament=tournament, stage='knockout_match_3', status='played').first()

    if match2 is not None:
        loser_match2 = match2.team1 if match2.winner_team_id == match2.team2_id else match2.team2
        status_map[loser_match2.team_id] = 'knockout_match_2_loser'

    if match3 is not None:
        loser_match3 = match3.team1 if match3.winner_team_id == match3.team2_id else match3.team2
        status_map[loser_match3.team_id] = 'knockout_match_3_loser'
        status_map[match3.winner_team_id] = 'runner_up'

    if match1 is not None and match1.winner_team is not None:
        status_map[match1.winner_team_id] = 'champion'
    return status_map


def generate_final_ranking(*, tournament: Tournament):
    match1 = Match.objects.filter(tournament=tournament, stage='knockout_match_1', status='played').first()
    match2 = Match.objects.filter(tournament=tournament, stage='knockout_match_2', status='played').first()
    match3 = Match.objects.filter(tournament=tournament, stage='knockout_match_3', status='played').first()
    if match1 is None or match2 is None or match3 is None:
        return []

    standings = calculate_group_standings(tournament=tournament)
    team_to_group_stats = {}
    for ranked_group in standings.values():
        for item in ranked_group:
            team_to_group_stats[item['team_id']] = item

    champion = match1.winner_team
    runner_up = match3.winner_team
    loser_match3 = match3.team1 if match3.winner_team_id == match3.team2_id else match3.team2
    loser_match2 = match2.team1 if match2.winner_team_id == match2.team2_id else match2.team2
    knockout_map = _knockout_status_map(tournament=tournament)

    ordered = [champion, runner_up]
    remaining = [
        team for team in tournament.teams.select_related('group').all()
        if team.team_id not in {champion.team_id, runner_up.team_id}
    ]
    remaining_sorted = sorted(
        remaining,
        key=lambda team: (
            -KNOCKOUT_PROGRESS_SCORES.get(knockout_map[team.team_id], 0),
            -(team_to_group_stats.get(team.team_id, {}).get('points', 0)),
            -(team_to_group_stats.get(team.team_id, {}).get('goal_difference', 0)),
            -(team_to_group_stats.get(team.team_id, {}).get('goals_for', 0)),
            team.team_id,
        ),
    )

    if loser_match3 in remaining_sorted:
        remaining_sorted.remove(loser_match3)
        remaining_sorted.insert(0, loser_match3)
    if loser_match2 in remaining_sorted:
        remaining_sorted.remove(loser_match2)
        insert_at = 1 if remaining_sorted and remaining_sorted[0].team_id == loser_match3.team_id else 0
        remaining_sorted.insert(insert_at, loser_match2)

    ordered.extend(remaining_sorted)

    with transaction.atomic():
        for index, team in enumerate(ordered, start=1):
            updates = []
            if team.final_rank != index:
                team.final_rank = index
                updates.append('final_rank')
            if index > 2 and team.status != 'eliminated':
                team.status = 'eliminated'
                updates.append('status')
            if updates:
                team.save(update_fields=updates)

        tournament.champion_team = champion
        tournament.runner_up_team = runner_up
        tournament.status = 'finished'
        tournament.save(update_fields=['champion_team', 'runner_up_team', 'status'])

    return ordered


def sync_tournament_after_match_result(*, tournament: Tournament):
    if _group_stage_complete(tournament=tournament):
        generate_knockout_matches(tournament=tournament)
    ensure_match_three(tournament=tournament)
    if Match.objects.filter(tournament=tournament, stage='knockout_match_3', status='played').exists():
        return generate_final_ranking(tournament=tournament)
    return []
