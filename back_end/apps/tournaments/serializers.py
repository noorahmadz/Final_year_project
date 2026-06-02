from django.db.models import Sum
from rest_framework import serializers

from .models import Match, MatchPlayerStat, Team, TeamMember, Tournament, TournamentGroup
from .roster import REQUIRED_TEAM_MEMBER_COUNT, normalize_team_members


class GroupStandingEntrySerializer(serializers.Serializer):
    team_id = serializers.IntegerField()
    team_name = serializers.CharField()
    position = serializers.IntegerField()
    played = serializers.IntegerField()
    wins = serializers.IntegerField()
    draws = serializers.IntegerField()
    losses = serializers.IntegerField()
    goals_for = serializers.IntegerField()
    goals_against = serializers.IntegerField()
    goal_difference = serializers.IntegerField()
    points = serializers.IntegerField()


class TournamentGroupSerializer(serializers.ModelSerializer):
    teams = serializers.SerializerMethodField()

    class Meta:
        model = TournamentGroup
        fields = ['group_id', 'name', 'order', 'teams']

    def get_teams(self, obj):
        return TeamSerializer(obj.teams.order_by('created_at', 'team_id'), many=True, context=self.context).data


class MatchSerializer(serializers.ModelSerializer):
    """Serializer for Match model."""

    team1_name = serializers.CharField(source='team1.team_name', read_only=True)
    team2_name = serializers.CharField(source='team2.team_name', read_only=True)
    winner_name = serializers.CharField(source='winner_team.team_name', read_only=True)
    top_player_name = serializers.CharField(source='top_player.name', read_only=True)
    top_player_role = serializers.CharField(source='top_player.role', read_only=True)
    top_player_team = serializers.IntegerField(source='top_player.team_id', read_only=True)
    player_goals = serializers.SerializerMethodField()
    field_name = serializers.CharField(source='field.field_name', read_only=True)
    group_name = serializers.CharField(source='group.name', read_only=True)

    class Meta:
        model = Match
        fields = [
            'match_id', 'tournament', 'group', 'group_name', 'field', 'field_name',
            'team1', 'team1_name', 'team2', 'team2_name', 'stage', 'stage_order',
            'match_date', 'start_time', 'end_time', 'team1_score', 'team2_score',
            'winner_team', 'winner_name', 'top_player', 'top_player_name',
            'top_player_role', 'top_player_team', 'top_player_goals', 'player_goals',
            'status', 'created_at',
        ]
        read_only_fields = ['match_id', 'tournament', 'created_at']

    def get_player_goals(self, obj):
        return [
            {
                'player_id': stat.player_id,
                'player_name': stat.player.name,
                'player_role': stat.player.role,
                'team_id': stat.team_id,
                'team_name': stat.team.team_name,
                'goals': stat.goals,
            }
            for stat in obj.player_stats.select_related('player', 'team').all()
        ]

    def validate(self, attrs):
        tournament = self.context.get('tournament') or attrs.get('tournament') or getattr(self.instance, 'tournament', None)
        team1 = attrs.get('team1') or getattr(self.instance, 'team1', None)
        team2 = attrs.get('team2') or getattr(self.instance, 'team2', None)
        field = attrs.get('field') or getattr(self.instance, 'field', None)
        match_date = attrs.get('match_date') or getattr(self.instance, 'match_date', None)
        start_time = attrs.get('start_time') or getattr(self.instance, 'start_time', None)
        end_time = attrs.get('end_time') or getattr(self.instance, 'end_time', None)
        stage = attrs.get('stage') or getattr(self.instance, 'stage', 'group')
        group = attrs.get('group') or getattr(self.instance, 'group', None)
        raw_tournament = self.initial_data.get('tournament')

        if raw_tournament is not None and tournament is not None:
            try:
                if int(raw_tournament) != int(tournament.tournament_id):
                    raise serializers.ValidationError(
                        {'tournament': 'Tournament must match the nested tournament URL.'}
                    )
            except (TypeError, ValueError):
                raise serializers.ValidationError({'tournament': 'Tournament must be a valid integer.'})

        if team1 and team2 and team1.team_id == team2.team_id:
            raise serializers.ValidationError({'team2': 'team1 and team2 must be different teams.'})

        if tournament and team1 and team1.tournament_id != tournament.tournament_id:
            raise serializers.ValidationError({'team1': 'team1 must belong to this tournament.'})
        if tournament and team2 and team2.tournament_id != tournament.tournament_id:
            raise serializers.ValidationError({'team2': 'team2 must belong to this tournament.'})
        if team1 and team1.status not in {'approved', 'confirmed'}:
            raise serializers.ValidationError({'team1': 'team1 must be owner-approved before being scheduled.'})
        if team2 and team2.status not in {'approved', 'confirmed'}:
            raise serializers.ValidationError({'team2': 'team2 must be owner-approved before being scheduled.'})

        if stage == 'group':
            if not group:
                raise serializers.ValidationError({'group': 'Group-stage matches must belong to a group.'})
            if team1 and group and team1.group_id != group.group_id:
                raise serializers.ValidationError({'team1': 'team1 must belong to the selected group.'})
            if team2 and group and team2.group_id != group.group_id:
                raise serializers.ValidationError({'team2': 'team2 must belong to the selected group.'})
        elif group is not None:
            raise serializers.ValidationError({'group': 'Knockout matches cannot belong to a group.'})

        if tournament and field and field.gym_id != tournament.gym_id:
            raise serializers.ValidationError({'field': 'Field must belong to the tournament gym.'})

        if start_time and end_time and start_time >= end_time:
            raise serializers.ValidationError({'end_time': 'End time must be after start time.'})

        if tournament and match_date:
            if match_date < tournament.start_date or match_date > tournament.end_date:
                raise serializers.ValidationError(
                    {'match_date': 'Match date must be within the tournament date range.'}
                )

        if field and match_date and start_time and end_time:
            overlap_qs = Match.objects.filter(
                field=field,
                match_date=match_date,
                start_time__lt=end_time,
                end_time__gt=start_time,
            )
            if self.instance:
                overlap_qs = overlap_qs.exclude(match_id=self.instance.match_id)
            if overlap_qs.exists():
                raise serializers.ValidationError(
                    {'non_field_errors': ['This field already has an overlapping match in the selected time range.']}
                )

        return attrs


class TeamMemberSerializer(serializers.ModelSerializer):
    """Serializer for registered team members."""

    class Meta:
        model = TeamMember
        fields = ['member_id', 'name', 'role', 'order']
        read_only_fields = ['member_id', 'order']


class TeamMemberInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    role = serializers.CharField(max_length=80)


class TeamSerializer(serializers.ModelSerializer):
    """Serializer for Team model."""

    group_name = serializers.CharField(source='group.name', read_only=True)
    members = TeamMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Team
        fields = [
            'team_id', 'tournament', 'group', 'group_name', 'team_name', 'captain_name',
            'captain_phone', 'members', 'status', 'final_rank', 'created_at',
        ]
        read_only_fields = ['team_id', 'group', 'status', 'final_rank', 'created_at']


class TournamentSerializer(serializers.ModelSerializer):
    """Serializer for Tournament model."""

    gym_name = serializers.CharField(source='gym.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    champion_team_name = serializers.CharField(source='champion_team.team_name', read_only=True)
    runner_up_team_name = serializers.CharField(source='runner_up_team.team_name', read_only=True)
    teams_count = serializers.SerializerMethodField()
    top_scorer = serializers.SerializerMethodField()
    groups = TournamentGroupSerializer(many=True, read_only=True)
    matches = MatchSerializer(many=True, read_only=True)

    class Meta:
        model = Tournament
        fields = [
            'tournament_id', 'gym', 'gym_name', 'created_by', 'created_by_name',
            'name', 'sport_type', 'start_date', 'end_date', 'registration_fee',
            'prize_amount', 'first_place_award', 'second_place_award',
            'third_place_award', 'top_scorer_award', 'max_teams',
            'teams_count', 'status', 'champion_team',
            'champion_team_name', 'runner_up_team', 'runner_up_team_name',
            'top_scorer', 'created_at', 'groups', 'matches',
        ]
        read_only_fields = [
            'tournament_id', 'created_by', 'status', 'champion_team', 'champion_team_name',
            'runner_up_team', 'runner_up_team_name', 'created_at',
        ]

    def get_teams_count(self, obj):
        return obj.teams.count()

    def get_top_scorer(self, obj):
        scorer = (
            MatchPlayerStat.objects.filter(match__tournament=obj, match__status='played')
            .values('player_id', 'player__name', 'player__role', 'team_id', 'team__team_name')
            .annotate(total_goals=Sum('goals'))
            .order_by('-total_goals', 'player__name')
            .first()
        )
        if scorer is None:
            return None
        return {
            'player_id': scorer['player_id'],
            'player_name': scorer['player__name'],
            'player_role': scorer['player__role'],
            'team_id': scorer['team_id'],
            'team_name': scorer['team__team_name'],
            'total_goals': scorer['total_goals'],
        }

    def validate(self, data):
        if 'status' in self.initial_data:
            raise serializers.ValidationError(
                {'status': 'Direct status updates are not allowed. Use lifecycle actions.'}
            )

        start_date = data.get('start_date') or getattr(self.instance, 'start_date', None)
        end_date = data.get('end_date') or getattr(self.instance, 'end_date', None)
        max_teams = data.get('max_teams') or getattr(self.instance, 'max_teams', None)

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError({'end_date': 'End date must be after start date.'})

        if max_teams is not None and max_teams < 4:
            raise serializers.ValidationError({'max_teams': 'This tournament format requires at least 4 team slots.'})

        return data

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class TournamentListSerializer(serializers.ModelSerializer):
    """Simplified serializer for listing tournaments."""

    gym_name = serializers.CharField(source='gym.name', read_only=True)
    teams_count = serializers.SerializerMethodField()

    class Meta:
        model = Tournament
        fields = [
            'tournament_id', 'gym', 'gym_name', 'name', 'sport_type',
            'start_date', 'end_date', 'registration_fee', 'max_teams',
            'prize_amount', 'first_place_award', 'second_place_award',
            'third_place_award', 'top_scorer_award', 'teams_count',
            'status', 'created_at',
        ]

    def get_teams_count(self, obj):
        return obj.teams.count()


class TeamRegisterSerializer(serializers.Serializer):
    """Serializer for team registration."""

    team_name = serializers.CharField(max_length=255)
    captain_name = serializers.CharField(max_length=255)
    captain_phone = serializers.CharField(max_length=20)
    members = TeamMemberInputSerializer(many=True)

    def validate_members(self, value):
        try:
            return normalize_team_members(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate(self, attrs):
        if len(attrs.get('members', [])) != REQUIRED_TEAM_MEMBER_COUNT:
            raise serializers.ValidationError(
                {'members': f'Exactly {REQUIRED_TEAM_MEMBER_COUNT} team members are required.'}
            )
        return attrs


class TeamAssignGroupSerializer(serializers.Serializer):
    group = serializers.ChoiceField(choices=['A', 'B'])


class MatchResultSerializer(serializers.Serializer):
    """Serializer for recording match results."""

    team1_score = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    team2_score = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    winner_team_id = serializers.IntegerField(required=False, allow_null=True)
    top_player_id = serializers.IntegerField(required=False, allow_null=True)
    top_player_goals = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    player_goals = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        allow_empty=True,
    )
    status = serializers.ChoiceField(choices=['played', 'cancelled'])

    def validate(self, attrs):
        match = self.context.get('match')
        if match is None:
            raise serializers.ValidationError('Match context is required.')

        result_status = attrs.get('status')
        team1_score = attrs.get('team1_score')
        team2_score = attrs.get('team2_score')
        winner_team_id = attrs.get('winner_team_id')
        top_player_id = attrs.get('top_player_id')
        top_player_goals = attrs.get('top_player_goals')
        player_goals = attrs.get('player_goals', [])

        if result_status == 'cancelled':
            if (
                team1_score is not None
                or team2_score is not None
                or winner_team_id is not None
                or top_player_id is not None
                or top_player_goals is not None
                or player_goals
            ):
                raise serializers.ValidationError(
                    'Cancelled matches cannot contain scores, a winner, top player, or player goals.'
                )
            return attrs

        if team1_score is None or team2_score is None:
            raise serializers.ValidationError(
                'Played matches require team1_score and team2_score.'
            )

        valid_winner_ids = {match.team1_id, match.team2_id}
        if top_player_id is not None:
            top_player = TeamMember.objects.filter(
                member_id=top_player_id,
                team_id__in=valid_winner_ids,
            ).first()
            if top_player is None:
                raise serializers.ValidationError(
                    {'top_player_id': 'Top player must be a member of one of the match teams.'}
                )
            attrs['top_player'] = top_player

        if top_player_id is None and top_player_goals is not None:
            raise serializers.ValidationError(
                {'top_player_goals': 'Top player goals require a selected top player.'}
            )

        total_goals = team1_score + team2_score
        if top_player_goals is not None and top_player_goals > total_goals:
            raise serializers.ValidationError(
                {'top_player_goals': 'Top player goals cannot exceed total match goals.'}
            )

        normalized_player_goals = []
        seen_player_ids = set()
        team_goal_totals = {match.team1_id: 0, match.team2_id: 0}
        for index, item in enumerate(player_goals, start=1):
            try:
                player_id = int(item.get('player_id'))
                goals = int(item.get('goals'))
            except (TypeError, ValueError, AttributeError):
                raise serializers.ValidationError(
                    {'player_goals': f'Player goal entry {index} must include numeric player_id and goals.'}
                )

            if goals <= 0:
                raise serializers.ValidationError(
                    {'player_goals': f'Player goal entry {index} must be greater than zero.'}
                )
            if player_id in seen_player_ids:
                raise serializers.ValidationError({'player_goals': 'Each player can appear only once.'})
            seen_player_ids.add(player_id)

            player = TeamMember.objects.select_related('team').filter(
                member_id=player_id,
                team_id__in=valid_winner_ids,
            ).first()
            if player is None:
                raise serializers.ValidationError(
                    {'player_goals': f'Player goal entry {index} must belong to one of the match teams.'}
                )

            team_goal_totals[player.team_id] += goals
            normalized_player_goals.append({'player': player, 'team': player.team, 'goals': goals})

        if normalized_player_goals:
            if team_goal_totals[match.team1_id] != team1_score:
                raise serializers.ValidationError(
                    {'player_goals': 'Team 1 player goals must equal team1_score.'}
                )
            if team_goal_totals[match.team2_id] != team2_score:
                raise serializers.ValidationError(
                    {'player_goals': 'Team 2 player goals must equal team2_score.'}
                )
            if top_player_id is not None:
                goals_by_player = {
                    stat['player'].member_id: stat['goals']
                    for stat in normalized_player_goals
                }
                if top_player_id not in goals_by_player:
                    raise serializers.ValidationError(
                        {'top_player_id': 'Top player must have a goal entry for this match.'}
                    )
                if top_player_goals is not None and goals_by_player[top_player_id] != top_player_goals:
                    raise serializers.ValidationError(
                        {'top_player_goals': 'Top player goals must match the selected player goal entry.'}
                    )
                if goals_by_player[top_player_id] < max(goals_by_player.values()):
                    raise serializers.ValidationError(
                        {'top_player_id': 'Top player must have the highest goal count in this match.'}
                    )
            attrs['player_goal_stats'] = normalized_player_goals

        if match.stage == 'group':
            if team1_score == team2_score:
                if winner_team_id is not None:
                    raise serializers.ValidationError({'winner_team_id': 'Drawn group matches must not declare a winner.'})
                return attrs
            if winner_team_id is None:
                raise serializers.ValidationError({'winner_team_id': 'A winner is required when the group-stage score is not a draw.'})
        else:
            if winner_team_id is None:
                raise serializers.ValidationError({'winner_team_id': 'Knockout matches require a winner.'})
            if team1_score == team2_score:
                raise serializers.ValidationError('Knockout matches cannot end in a draw.')

        if winner_team_id is not None and winner_team_id not in valid_winner_ids:
            raise serializers.ValidationError({'winner_team_id': 'Winner must be one of the match teams.'})

        if winner_team_id is not None:
            if team1_score > team2_score and winner_team_id != match.team1_id:
                raise serializers.ValidationError({'winner_team_id': 'Winner must match the higher score.'})
            if team2_score > team1_score and winner_team_id != match.team2_id:
                raise serializers.ValidationError({'winner_team_id': 'Winner must match the higher score.'})

        return attrs
