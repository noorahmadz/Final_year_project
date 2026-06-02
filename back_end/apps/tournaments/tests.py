from datetime import date, timedelta
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.gyms.models import Field, Gym
from apps.tournaments.models import Match, Team, TeamMember, Tournament
from apps.tournaments.services import calculate_group_standings
from apps.payments.models import TournamentPayment
from apps.users.models import User, UserNotification


class TournamentFormatBaseTestCase(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com',
            phone='700000001',
            full_name='Owner User',
            password='pass12345',
            role='owner',
            is_verified=True,
        )
        self.customer = User.objects.create_user(
            email='customer@example.com',
            phone='700000002',
            full_name='Customer User',
            password='pass12345',
            role='customer',
            is_verified=True,
        )
        self.gym = Gym.objects.create(
            owner=self.owner,
            name='Arena',
            address='Addr',
            city='Kabul',
            phone='0799990001',
            status='approved',
        )
        self.field = Field.objects.create(
            gym=self.gym,
            field_name='Field A',
            field_type='futsal',
            price_per_hour=Decimal('1000.00'),
        )
        self.start_date = date.today() + timedelta(days=1)
        self.end_date = self.start_date + timedelta(days=3)
        self.tournament = Tournament.objects.create(
            gym=self.gym,
            created_by=self.owner,
            name='Spring Cup',
            sport_type='futsal',
            start_date=self.start_date,
            end_date=self.end_date,
            registration_fee=Decimal('500.00'),
            prize_amount=Decimal('2500.00'),
            max_teams=8,
        )
        self.client.force_authenticate(self.owner)

    def create_team(self, index, *, status='confirmed'):
        return Team.objects.create(
            tournament=self.tournament,
            team_name=f'Team {index}',
            captain_name=f'Captain {index}',
            captain_phone=f'0799000{index:03d}',
            status=status,
        )

    def team_members_payload(self):
        return [
            {'name': f'Player {index}', 'role': 'player'}
            for index in range(1, 8)
        ]

    def unwrap(self, response):
        if isinstance(response.data, dict) and 'data' in response.data:
            return response.data['data']
        return response.data

    def start_tournament(self):
        return self.client.post(
            reverse('tournaments:tournament-start-tournament', args=[self.tournament.tournament_id]),
            {},
            format='json',
        )

    def record_match(self, match, team1_score, team2_score, winner=None):
        payload = {
            'status': 'played',
            'team1_score': team1_score,
            'team2_score': team2_score,
        }
        if winner is not None:
            payload['winner_team_id'] = winner.team_id
        response = self.client.post(
            reverse('tournaments:match-result', args=[match.match_id]),
            payload,
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=getattr(response, 'data', None))
        match.refresh_from_db()
        return match


class TournamentRegistrationTests(TournamentFormatBaseTestCase):
    def test_owner_can_create_tournament_with_awards(self):
        response = self.client.post(
            reverse('tournaments:tournament-list'),
            {
                'gym': self.gym.gym_id,
                'name': 'Awards Cup',
                'sport_type': 'futsal',
                'start_date': self.start_date,
                'end_date': self.end_date,
                'registration_fee': '500.00',
                'first_place_award': 'Gold medal and 3000 AFN',
                'second_place_award': 'Silver medal and 2000 AFN',
                'third_place_award': 'Bronze medal and 1000 AFN',
                'top_scorer_award': 'Top scorer trophy',
                'max_teams': 8,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, msg=getattr(response, 'data', None))
        tournament = Tournament.objects.get(name='Awards Cup')
        self.assertEqual(tournament.first_place_award, 'Gold medal and 3000 AFN')
        self.assertEqual(tournament.second_place_award, 'Silver medal and 2000 AFN')
        self.assertEqual(tournament.third_place_award, 'Bronze medal and 1000 AFN')
        self.assertEqual(tournament.top_scorer_award, 'Top scorer trophy')

    def test_register_returns_payment_step_with_roster_payload(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('tournaments:tournament-register', args=[self.tournament.tournament_id]),
            {
                'team_name': 'Roster FC',
                'captain_name': 'Captain Roster',
                'captain_phone': '0799001000',
                'members': self.team_members_payload(),
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED, msg=getattr(response, 'data', None))
        payload = self.unwrap(response)['next_step']['payload']
        self.assertEqual(len(payload['members']), 7)
        self.assertEqual(self.tournament.teams.count(), 0)

    def test_register_rejects_incomplete_roster(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            reverse('tournaments:tournament-register', args=[self.tournament.tournament_id]),
            {
                'team_name': 'Short Roster FC',
                'captain_name': 'Captain Short',
                'captain_phone': '0799001001',
                'members': self.team_members_payload()[:6],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class TournamentFormatGenerationTests(TournamentFormatBaseTestCase):
    def test_group_creation_fair_distribution_and_round_robin_generation(self):
        teams = [self.create_team(i) for i in range(1, 9)]

        response = self.start_tournament()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.tournament.refresh_from_db()
        self.assertEqual(self.tournament.status, 'ongoing')

        groups = list(self.tournament.groups.order_by('order'))
        self.assertEqual([group.name for group in groups], ['A', 'B'])
        self.assertEqual(groups[0].teams.count(), 4)
        self.assertEqual(groups[1].teams.count(), 4)

        group_a_team_ids = list(groups[0].teams.order_by('team_id').values_list('team_id', flat=True))
        group_b_team_ids = list(groups[1].teams.order_by('team_id').values_list('team_id', flat=True))
        self.assertEqual(group_a_team_ids, [teams[0].team_id, teams[2].team_id, teams[4].team_id, teams[6].team_id])
        self.assertEqual(group_b_team_ids, [teams[1].team_id, teams[3].team_id, teams[5].team_id, teams[7].team_id])

        group_matches = self.tournament.matches.filter(stage='group')
        self.assertEqual(group_matches.count(), 12)
        self.assertEqual(group_matches.filter(group__name='A').count(), 6)
        self.assertEqual(group_matches.filter(group__name='B').count(), 6)

    def test_odd_team_distribution_remains_balanced(self):
        self.tournament.max_teams = 7
        self.tournament.save(update_fields=['max_teams'])
        for index in range(1, 8):
            self.create_team(index)

        response = self.start_tournament()
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        group_sizes = [group.teams.count() for group in self.tournament.groups.order_by('order')]
        self.assertEqual(sorted(group_sizes), [3, 4])


class TournamentStandingTests(TournamentFormatBaseTestCase):
    def setUp(self):
        super().setUp()
        self.teams = [self.create_team(i) for i in range(1, 9)]
        response = self.start_tournament()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.group_a = self.tournament.groups.get(name='A')
        self.group_b = self.tournament.groups.get(name='B')

    def _group_match(self, group, team1, team2):
        return Match.objects.get(
            tournament=self.tournament,
            stage='group',
            group=group,
            team1=team1,
            team2=team2,
        )

    def test_standings_calculation_and_top_two_qualification(self):
        a1, a2, a3, a4 = list(self.group_a.teams.order_by('team_id'))
        b1, b2, b3, b4 = list(self.group_b.teams.order_by('team_id'))

        group_a_results = [
            (a1, a2, 2, 1, a1),
            (a1, a3, 3, 1, a1),
            (a1, a4, 1, 1, None),
            (a2, a3, 1, 0, a2),
            (a2, a4, 1, 2, a4),
            (a3, a4, 0, 0, None),
        ]
        group_b_results = [
            (b1, b2, 1, 0, b1),
            (b1, b3, 2, 0, b1),
            (b1, b4, 3, 0, b1),
            (b2, b3, 1, 1, None),
            (b2, b4, 2, 0, b2),
            (b3, b4, 1, 0, b3),
        ]

        for team1, team2, score1, score2, winner in group_a_results + group_b_results:
            match = self._group_match(team1.group, team1, team2)
            self.record_match(match, score1, score2, winner)

        standings = calculate_group_standings(tournament=self.tournament)
        self.assertEqual([entry['team'].team_name for entry in standings['A'][:2]], [a1.team_name, a4.team_name])
        self.assertEqual([entry['team'].team_name for entry in standings['B'][:2]], [b1.team_name, b2.team_name])
        self.assertEqual(standings['A'][0]['points'], 7)
        self.assertEqual(standings['B'][0]['points'], 9)

        bracket_response = self.client.get(
            reverse('tournaments:tournament-bracket', args=[self.tournament.tournament_id])
        )
        self.assertEqual(bracket_response.status_code, status.HTTP_200_OK)
        bracket = bracket_response.data['data']['bracket']
        self.assertEqual(len(bracket['knockout_match_1']), 1)
        self.assertEqual(len(bracket['knockout_match_2']), 1)
        self.assertEqual(bracket['knockout_match_3'], [])

    def test_tie_break_uses_head_to_head_after_points_goal_difference_and_goals_scored(self):
        a1, a2, a3, a4 = list(self.group_a.teams.order_by('team_id'))
        b1, b2, b3, b4 = list(self.group_b.teams.order_by('team_id'))

        relevant_results = [
            (a1, a2, 1, 0, a1),
            (a1, a3, 1, 0, a1),
            (a1, a4, 1, 2, a4),
            (a2, a3, 1, 0, a2),
            (a2, a4, 2, 1, a2),
            (a3, a4, 0, 0, None),
        ]
        filler_results = [
            (b1, b2, 1, 0, b1),
            (b1, b3, 1, 0, b1),
            (b1, b4, 1, 0, b1),
            (b2, b3, 1, 0, b2),
            (b2, b4, 1, 0, b2),
            (b3, b4, 1, 0, b3),
        ]

        for team1, team2, score1, score2, winner in relevant_results + filler_results:
            match = self._group_match(team1.group, team1, team2)
            self.record_match(match, score1, score2, winner)

        standings = calculate_group_standings(tournament=self.tournament)
        self.assertEqual(standings['A'][0]['team'].team_id, a1.team_id)
        self.assertEqual(standings['A'][1]['team'].team_id, a2.team_id)
        self.assertEqual(standings['A'][0]['points'], standings['A'][1]['points'])
        self.assertEqual(standings['A'][0]['goal_difference'], standings['A'][1]['goal_difference'])
        self.assertEqual(standings['A'][0]['goals_for'], standings['A'][1]['goals_for'])

    def test_match_result_records_top_player_from_match_teams(self):
        a1, a2, *_ = list(self.group_a.teams.order_by('team_id'))
        player = TeamMember.objects.create(team=a1, name='Finisher', role='Forward', order=1)
        opponent_scorer = TeamMember.objects.create(team=a2, name='Reply', role='Forward', order=1)
        other_team = self.create_team(99)
        outside_player = TeamMember.objects.create(team=other_team, name='Outsider', role='Forward', order=1)
        match = self._group_match(self.group_a, a1, a2)

        invalid_response = self.client.post(
            reverse('tournaments:match-result', args=[match.match_id]),
            {
                'status': 'played',
                'team1_score': 2,
                'team2_score': 1,
                'winner_team_id': a1.team_id,
                'top_player_id': outside_player.member_id,
                'top_player_goals': 1,
            },
            format='json',
        )
        self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            reverse('tournaments:match-result', args=[match.match_id]),
            {
                'status': 'played',
                'team1_score': 2,
                'team2_score': 1,
                'winner_team_id': a1.team_id,
                'top_player_id': player.member_id,
                'top_player_goals': 2,
                'player_goals': [
                    {'player_id': player.member_id, 'goals': 2},
                    {'player_id': opponent_scorer.member_id, 'goals': 1},
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=getattr(response, 'data', None))
        match.refresh_from_db()
        self.assertEqual(match.top_player_id, player.member_id)
        self.assertEqual(match.top_player_goals, 2)
        self.assertEqual(match.player_stats.count(), 2)
        payload = self.unwrap(response)['match']
        self.assertEqual(payload['top_player_name'], player.name)
        self.assertEqual(len(payload['player_goals']), 2)

        detail_response = self.client.get(
            reverse('tournaments:tournament-detail', args=[self.tournament.tournament_id])
        )
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        top_scorer = self.unwrap(detail_response)['top_scorer']
        self.assertEqual(top_scorer['player_id'], player.member_id)
        self.assertEqual(top_scorer['total_goals'], 2)


class TournamentKnockoutAndRankingTests(TournamentFormatBaseTestCase):
    def setUp(self):
        super().setUp()
        for index in range(1, 5):
            self.create_team(index)
        response = self.start_tournament()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.group_a = self.tournament.groups.get(name='A')
        self.group_b = self.tournament.groups.get(name='B')

    def _group_match(self, team1, team2):
        return Match.objects.get(
            tournament=self.tournament,
            stage='group',
            team1=team1,
            team2=team2,
        )

    def test_knockout_generation_champion_runner_up_and_final_numeric_ranking(self):
        a1, a2 = list(self.group_a.teams.order_by('team_id'))
        b1, b2 = list(self.group_b.teams.order_by('team_id'))

        self.record_match(self._group_match(a1, a2), 2, 0, a1)
        self.record_match(self._group_match(b1, b2), 1, 0, b1)

        match1 = Match.objects.get(tournament=self.tournament, stage='knockout_match_1')
        match2 = Match.objects.get(tournament=self.tournament, stage='knockout_match_2')
        self.assertEqual({match1.team1_id, match1.team2_id}, {a1.team_id, b1.team_id})
        self.assertEqual({match2.team1_id, match2.team2_id}, {a2.team_id, b2.team_id})

        self.record_match(match1, 3, 1, a1)
        if match2.team1_id == b2.team_id:
            self.record_match(match2, 2, 1, b2)
        else:
            self.record_match(match2, 1, 2, b2)

        match3 = Match.objects.get(tournament=self.tournament, stage='knockout_match_3')
        self.assertEqual({match3.team1_id, match3.team2_id}, {b2.team_id, b1.team_id})

        if match3.team1_id == b2.team_id:
            self.record_match(match3, 2, 0, b2)
        else:
            self.record_match(match3, 0, 2, b2)

        self.tournament.refresh_from_db()
        self.assertEqual(self.tournament.status, 'finished')
        self.assertEqual(self.tournament.champion_team_id, a1.team_id)
        self.assertEqual(self.tournament.runner_up_team_id, b2.team_id)

        ranking = list(self.tournament.teams.order_by('final_rank').values_list('team_id', 'final_rank'))
        self.assertEqual(
            ranking,
            [
                (a1.team_id, 1),
                (b2.team_id, 2),
                (b1.team_id, 3),
                (a2.team_id, 4),
            ],
        )

        ranking_response = self.client.get(
            reverse('tournaments:tournament-ranking', args=[self.tournament.tournament_id])
        )
        self.assertEqual(ranking_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item['team_id'] for item in ranking_response.data['data']['ranking']],
            [a1.team_id, b2.team_id, b1.team_id, a2.team_id],
        )


class TournamentOwnerWorkflowTests(TournamentFormatBaseTestCase):
    def setUp(self):
        super().setUp()
        self.pending_team = self.create_team(1, status='pending_owner_approval')
        TournamentPayment.objects.create(
            tournament=self.tournament,
            team=self.pending_team,
            payer=self.customer,
            gym=self.gym,
            amount=self.tournament.registration_fee,
            currency='AFN',
            payment_gateway='stripe',
            transaction_id='pi_pending_team_1',
            payment_status='success',
        )

    def test_owner_can_approve_pending_team_and_notification_is_created(self):
        response = self.client.post(
            reverse('tournaments:team-approve', args=[self.pending_team.team_id]),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=getattr(response, 'data', None))
        self.pending_team.refresh_from_db()
        self.assertEqual(self.pending_team.status, 'approved')
        notification = UserNotification.objects.get(user=self.customer)
        self.assertEqual(notification.notification_type, 'tournament_team_approved')
        self.assertIn(self.tournament.name, notification.message)

    def test_owner_can_reject_pending_team_and_notification_is_created(self):
        response = self.client.post(
            reverse('tournaments:team-reject', args=[self.pending_team.team_id]),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, msg=getattr(response, 'data', None))
        self.pending_team.refresh_from_db()
        self.assertEqual(self.pending_team.status, 'rejected')
        notification = UserNotification.objects.get(user=self.customer)
        self.assertEqual(notification.notification_type, 'tournament_team_rejected')
        self.assertIn(self.tournament.name, notification.message)

    def test_assign_group_requires_owner_approved_team_and_does_not_auto_start(self):
        teams = [self.pending_team]
        for index in range(2, 5):
            team = self.create_team(index, status='approved')
            TournamentPayment.objects.create(
                tournament=self.tournament,
                team=team,
                payer=self.customer,
                gym=self.gym,
                amount=self.tournament.registration_fee,
                currency='AFN',
                payment_gateway='stripe',
                transaction_id=f'pi_team_{index}',
                payment_status='success',
            )
            teams.append(team)

        approve_response = self.client.post(
            reverse('tournaments:team-approve', args=[self.pending_team.team_id]),
            {},
            format='json',
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, msg=getattr(approve_response, 'data', None))

        assignments = [
            (teams[0], 'A'),
            (teams[1], 'A'),
            (teams[2], 'B'),
            (teams[3], 'B'),
        ]
        for team, group in assignments:
            response = self.client.post(
                reverse('tournaments:team-assign-group', args=[team.team_id]),
                {'group': group},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, msg=getattr(response, 'data', None))

        self.tournament.refresh_from_db()
        self.assertEqual(self.tournament.status, 'upcoming')
        self.assertEqual(self.tournament.matches.filter(stage='group').count(), 0)

    def test_assign_group_is_idempotent_for_same_group(self):
        self.pending_team.status = 'approved'
        self.pending_team.save(update_fields=['status'])

        first = self.client.post(
            reverse('tournaments:team-assign-group', args=[self.pending_team.team_id]),
            {'group': 'A'},
            format='json',
        )
        second = self.client.post(
            reverse('tournaments:team-assign-group', args=[self.pending_team.team_id]),
            {'group': 'A'},
            format='json',
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK, msg=getattr(first, 'data', None))
        self.assertEqual(second.status_code, status.HTTP_200_OK, msg=getattr(second, 'data', None))
        self.pending_team.refresh_from_db()
        self.assertEqual(self.pending_team.group.name, 'A')
