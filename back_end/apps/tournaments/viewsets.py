from django.db import IntegrityError, transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated

from apps.common.api import ApiResponseMixin
from apps.gyms.models import Field

from .api import error_response, success_response
from .models import Match, MatchPlayerStat, Team, Tournament
from .roster import normalize_team_members
from .serializers import (
    GroupStandingEntrySerializer,
    MatchResultSerializer,
    MatchSerializer,
    TeamAssignGroupSerializer,
    TeamRegisterSerializer,
    TeamSerializer,
    TournamentGroupSerializer,
    TournamentListSerializer,
    TournamentSerializer,
)
from .services import (
    assign_teams_to_groups,
    calculate_group_standings,
    create_groups,
    generate_final_ranking,
    generate_group_matches,
    generate_knockout_matches,
    sync_tournament_after_match_result,
)

TEAM_REVIEW_TRANSITIONS = {
    'pending_owner_approval': {'approved', 'rejected'},
}

APPROVED_TEAM_STATUSES = {'approved', 'confirmed'}


class TournamentApiMixin(ApiResponseMixin):
    @staticmethod
    def _action_success(*, data=None, message=None, status_code=status.HTTP_200_OK, extra=None):
        return success_response(data=data, message=message, status_code=status_code, extra=extra)

    @staticmethod
    def _action_error(*, message, errors=None, status_code=status.HTTP_400_BAD_REQUEST, extra=None):
        return error_response(message=message, errors=errors, status_code=status_code, extra=extra)

    def _optional_paginated_collection_response(self, queryset, *, serializer_class):
        wants_paginated = str(self.request.query_params.get('paginated', '')).strip().lower() in {'1', 'true', 'yes'}
        serializer = serializer_class(queryset, many=True, context=self.get_serializer_context())
        if not wants_paginated:
            return self._action_success(
                data={'results': serializer.data, 'collection_behavior': 'unpaginated'},
                extra={'results': serializer.data, 'collection_behavior': 'unpaginated'},
            )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = serializer_class(page, many=True, context=self.get_serializer_context())
            paginated = self.get_paginated_response(serializer.data)
            paginated.data['data']['collection_behavior'] = 'paginated'
            return paginated

        serializer = serializer_class(queryset, many=True, context=self.get_serializer_context())
        return self._action_success(
            data={'results': serializer.data, 'collection_behavior': 'paginated'},
            extra={'results': serializer.data, 'collection_behavior': 'paginated'},
        )


class TournamentViewSet(TournamentApiMixin, viewsets.ModelViewSet):
    """ViewSet for managing tournaments."""

    queryset = Tournament.objects.select_related('gym', 'created_by', 'champion_team', 'runner_up_team').all()
    serializer_class = TournamentSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return TournamentListSerializer
        return TournamentSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'groups', 'standings', 'bracket', 'ranking']:
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        base_queryset = Tournament.objects.select_related('gym', 'created_by', 'champion_team', 'runner_up_team')
        if not user.is_authenticated:
            return base_queryset.filter(status__in=['upcoming', 'ongoing', 'finished'])
        if user.role == 'admin':
            return base_queryset.all()
        if user.role == 'owner':
            return base_queryset.filter(gym__owner=user)
        return base_queryset.filter(status__in=['upcoming', 'ongoing', 'finished'])

    def _ensure_owner_or_admin(self, tournament):
        user = self.request.user
        if user.role == 'admin':
            return
        if user.role != 'owner' or tournament.gym.owner_id != user.user_id:
            raise PermissionDenied('You do not have permission to manage this tournament.')

    def _serialize_tournament(self, tournament):
        return TournamentSerializer(tournament, context=self.get_serializer_context()).data

    def _serialize_team(self, team):
        return TeamSerializer(team, context=self.get_serializer_context()).data

    def _serialize_match(self, match):
        return MatchSerializer(match, context=self.get_serializer_context()).data

    def perform_create(self, serializer):
        gym = serializer.validated_data['gym']
        user = self.request.user
        if user.role != 'admin' and (user.role != 'owner' or gym.owner_id != user.user_id):
            raise PermissionDenied('You can only create tournaments for your own gyms.')
        serializer.save(created_by=user)

    def perform_update(self, serializer):
        instance = serializer.instance
        self._ensure_owner_or_admin(instance)
        new_gym = serializer.validated_data.get('gym')
        user = self.request.user
        if (
            new_gym is not None
            and user.role != 'admin'
            and (user.role != 'owner' or new_gym.owner_id != user.user_id)
        ):
            raise PermissionDenied('You can only assign tournaments to your own gyms.')
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_owner_or_admin(instance)
        instance.delete()

    @action(detail=True, methods=['post'])
    def register(self, request, pk=None):
        """
        Payment-gated registration compatibility endpoint.
        """
        input_serializer = TeamRegisterSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            tournament = Tournament.objects.select_for_update().get(pk=self.get_object().pk)
            if tournament.status != 'upcoming':
                return self._action_error(
                    message='Registration is not open for this tournament.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            if tournament.teams.count() >= tournament.max_teams:
                return self._action_error(
                    message='Maximum number of teams reached.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            team_name = input_serializer.validated_data['team_name'].strip()
            captain_name = input_serializer.validated_data['captain_name'].strip()
            captain_phone = input_serializer.validated_data['captain_phone'].strip()
            members = normalize_team_members(input_serializer.validated_data['members'])

            if Team.objects.filter(tournament=tournament, team_name__iexact=team_name).exists():
                return self._action_error(
                    message='A team with this name already exists in this tournament.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            if Team.objects.filter(tournament=tournament, captain_phone=captain_phone).exists():
                return self._action_error(
                    message='A team with this captain phone already exists in this tournament.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

        next_step = {
            'endpoint': '/api/payments/tournament/create-intent/',
            'method': 'POST',
            'key': 'create_registration_payment',
            'payload': {
                'tournament_id': tournament.tournament_id,
                'team_name': team_name,
                'captain_name': captain_name,
                'captain_phone': captain_phone,
                'members': members,
            },
        }
        return self._action_success(
            message=(
                'Registration requires successful payment first and remains pending owner approval '
                'until the tournament owner explicitly approves it.'
            ),
            status_code=status.HTTP_202_ACCEPTED,
            data={
                'registration_status': 'payment_required',
                'next_step': next_step,
                'next_step_key': 'create_registration_payment',
            },
            extra={
                'registration_status': 'payment_required',
                'next_step': next_step,
                'next_step_key': 'create_registration_payment',
            },
        )

    @action(detail=True, methods=['get'])
    def teams(self, request, pk=None):
        tournament = self.get_object()
        queryset = tournament.teams.select_related('group').all().order_by('created_at', 'team_id')
        return self._optional_paginated_collection_response(queryset, serializer_class=TeamSerializer)

    @action(detail=True, methods=['get'])
    def groups(self, request, pk=None):
        tournament = self.get_object()
        queryset = tournament.groups.prefetch_related('teams').all().order_by('order', 'group_id')
        serializer = TournamentGroupSerializer(queryset, many=True, context=self.get_serializer_context())
        return self._action_success(data={'groups': serializer.data}, extra={'groups': serializer.data})

    @action(detail=True, methods=['get'])
    def standings(self, request, pk=None):
        tournament = self.get_object()
        standings = calculate_group_standings(tournament=tournament)
        payload = {}
        for group_name, entries in standings.items():
            payload[group_name] = GroupStandingEntrySerializer(entries, many=True).data
        return self._action_success(data={'standings': payload}, extra={'standings': payload})

    @action(detail=True, methods=['get'])
    def bracket(self, request, pk=None):
        tournament = self.get_object()
        matches = tournament.matches.select_related('group', 'field', 'team1', 'team2', 'winner_team', 'top_player').all().order_by(
            'match_date', 'start_time', 'stage_order', 'match_id'
        )
        serializer = MatchSerializer(matches, many=True, context=self.get_serializer_context())
        grouped = {
            'group_stage': [item for item in serializer.data if item['stage'] == 'group'],
            'knockout_match_1': [item for item in serializer.data if item['stage'] == 'knockout_match_1'],
            'knockout_match_2': [item for item in serializer.data if item['stage'] == 'knockout_match_2'],
            'knockout_match_3': [item for item in serializer.data if item['stage'] == 'knockout_match_3'],
        }
        return self._action_success(data={'bracket': grouped}, extra={'bracket': grouped})

    @action(detail=True, methods=['get'])
    def ranking(self, request, pk=None):
        tournament = self.get_object()
        queryset = tournament.teams.select_related('group').exclude(final_rank__isnull=True).order_by('final_rank', 'team_id')
        serializer = TeamSerializer(queryset, many=True, context=self.get_serializer_context())
        return self._action_success(data={'ranking': serializer.data}, extra={'ranking': serializer.data})

    @action(detail=True, methods=['get', 'post'])
    def matches(self, request, pk=None):
        tournament = self.get_object()

        if request.method == 'GET':
            queryset = tournament.matches.select_related('group', 'field', 'team1', 'team2', 'winner_team', 'top_player').all().order_by(
                'match_date', 'start_time', 'stage_order', 'match_id'
            )
            return self._optional_paginated_collection_response(queryset, serializer_class=MatchSerializer)

        self._ensure_owner_or_admin(tournament)
        if tournament.status in ['finished', 'cancelled']:
            return self._action_error(
                message='Matches cannot be created for finished or cancelled tournaments.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            serializer = MatchSerializer(data=request.data, context={'tournament': tournament})
            serializer.is_valid(raise_exception=True)

            field = serializer.validated_data['field']
            match_date = serializer.validated_data['match_date']
            start_time = serializer.validated_data['start_time']
            end_time = serializer.validated_data['end_time']

            Field.objects.select_for_update().get(field_id=field.field_id)
            has_overlap = Match.objects.select_for_update().filter(
                field=field,
                match_date=match_date,
                start_time__lt=end_time,
                end_time__gt=start_time,
            ).exists()
            if has_overlap:
                raise ValidationError(
                    {'non_field_errors': ['This field already has an overlapping match in the selected time range.']}
                )

            try:
                match = serializer.save(tournament=tournament)
            except IntegrityError as exc:
                raise ValidationError({'non_field_errors': [str(exc)]})

        match_data = self._serialize_match(match)
        return self._action_success(
            message='Match created successfully.',
            status_code=status.HTTP_201_CREATED,
            data={'match': match_data},
            extra={'match': match_data},
        )

    @action(detail=True, methods=['post'])
    def start_tournament(self, request, pk=None):
        tournament = self.get_object()
        self._ensure_owner_or_admin(tournament)

        if tournament.status != 'upcoming':
            return self._action_error(
                message='Tournament cannot be started from current status.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                tournament = Tournament.objects.select_for_update().get(pk=tournament.pk)
                assign_teams_to_groups(tournament=tournament)
                create_groups(tournament=tournament)
                generate_group_matches(tournament=tournament)
                tournament.status = 'ongoing'
                tournament.champion_team = None
                tournament.runner_up_team = None
                tournament.save(update_fields=['status', 'champion_team', 'runner_up_team'])
        except ValueError as exc:
            return self._action_error(message=str(exc), status_code=status.HTTP_400_BAD_REQUEST)

        tournament_data = self._serialize_tournament(tournament)
        return self._action_success(
            message='Tournament started successfully.',
            data={'tournament': tournament_data},
            extra={'tournament': tournament_data},
        )

    @action(detail=True, methods=['post'])
    def finish_tournament(self, request, pk=None):
        tournament = self.get_object()
        self._ensure_owner_or_admin(tournament)

        if tournament.status == 'finished':
            tournament_data = self._serialize_tournament(tournament)
            return self._action_success(
                message='Tournament already finished.',
                data={'tournament': tournament_data},
                extra={'tournament': tournament_data},
            )

        if tournament.status != 'ongoing':
            return self._action_error(
                message='Tournament cannot be finished from current status.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        ranking = generate_final_ranking(tournament=tournament)
        if not ranking:
            return self._action_error(
                message='Final ranking cannot be generated until all knockout matches are completed.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        tournament.refresh_from_db()
        tournament_data = self._serialize_tournament(tournament)
        return self._action_success(
            message='Tournament finished successfully.',
            data={'tournament': tournament_data},
            extra={'tournament': tournament_data},
        )

    @action(detail=True, methods=['post'])
    def cancel_tournament(self, request, pk=None):
        tournament = self.get_object()
        self._ensure_owner_or_admin(tournament)

        if tournament.status not in ['upcoming', 'ongoing']:
            return self._action_error(
                message='Tournament cannot be cancelled from current status.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        tournament.status = 'cancelled'
        tournament.champion_team = None
        tournament.runner_up_team = None
        tournament.save(update_fields=['status', 'champion_team', 'runner_up_team'])
        tournament_data = self._serialize_tournament(tournament)

        return self._action_success(
            message='Tournament cancelled successfully.',
            data={'tournament': tournament_data},
            extra={'tournament': tournament_data},
        )


class TeamViewSet(TournamentApiMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only team endpoints; registration happens through tournament action."""

    queryset = Team.objects.select_related('tournament', 'group').prefetch_related('members').all()
    serializer_class = TeamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return Team.objects.select_related('tournament', 'group').prefetch_related('members').all()
        if user.role == 'owner':
            return Team.objects.select_related('tournament', 'group').prefetch_related('members').filter(tournament__gym__owner=user)
        return Team.objects.select_related('tournament', 'group').prefetch_related('members').filter(tournament__status__in=['upcoming', 'ongoing', 'finished'])

    def _ensure_owner_or_admin(self, team):
        user = self.request.user
        if user.role == 'admin':
            return
        if user.role != 'owner' or team.tournament.gym.owner_id != user.user_id:
            raise PermissionDenied('You do not have permission to manage this team registration.')

    def _serialize_team(self, team):
        return TeamSerializer(team, context=self.get_serializer_context()).data

    @staticmethod
    def _notify_team_decision(*, team, approved):
        from apps.users.models import UserNotification

        payment = team.payments.select_related('payer').filter(payment_status='success').order_by('-created_at').first()
        if payment is None or payment.payer_id is None:
            return

        notification_type = (
            UserNotification.Type.TOURNAMENT_TEAM_APPROVED
            if approved
            else UserNotification.Type.TOURNAMENT_TEAM_REJECTED
        )
        message = (
            f'Your team has been approved for {team.tournament.name}'
            if approved
            else f'Your team has been rejected for {team.tournament.name}'
        )
        UserNotification.objects.create(
            user=payment.payer,
            notification_type=notification_type,
            message=message,
            metadata={
                'team_id': team.team_id,
                'tournament_id': team.tournament_id,
                'tournament_name': team.tournament.name,
                'status': team.status,
            },
        )

    @staticmethod
    def _transition_review_status(*, team, target_status):
        allowed_targets = TEAM_REVIEW_TRANSITIONS.get(team.status, set())
        if target_status not in allowed_targets:
            return False
        team.status = target_status
        team.save(update_fields=['status'])
        return True

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        with transaction.atomic():
            team = Team.objects.select_related('tournament', 'tournament__gym').prefetch_related('payments').select_for_update().get(
                pk=self.get_object().pk
            )
            self._ensure_owner_or_admin(team)

            if team.tournament.status != 'upcoming':
                return self._action_error(
                    message='Teams can only be approved while the tournament is upcoming.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            if team.status == 'approved':
                team_data = self._serialize_team(team)
                return self._action_success(
                    message='Team already approved.',
                    data={'team': team_data, 'registration_status': 'approved', 'next_step': 'team_approved'},
                    extra={'team': team_data, 'registration_status': 'approved', 'next_step': 'team_approved'},
                )
            if not self._transition_review_status(team=team, target_status='approved'):
                return self._action_error(
                    message='Only teams pending owner approval can be approved.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            self._notify_team_decision(team=team, approved=True)

        team_data = self._serialize_team(team)
        return self._action_success(
            message='Team approved successfully.',
            data={'team': team_data, 'registration_status': 'approved', 'next_step': 'team_approved'},
            extra={'team': team_data, 'registration_status': 'approved', 'next_step': 'team_approved'},
        )

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        with transaction.atomic():
            team = Team.objects.select_related('tournament', 'tournament__gym').prefetch_related('payments').select_for_update().get(
                pk=self.get_object().pk
            )
            self._ensure_owner_or_admin(team)

            if team.tournament.status != 'upcoming':
                return self._action_error(
                    message='Teams can only be rejected while the tournament is upcoming.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            if team.status == 'rejected':
                team_data = self._serialize_team(team)
                return self._action_success(
                    message='Team already rejected.',
                    data={'team': team_data, 'registration_status': 'rejected', 'next_step': 'registration_closed'},
                    extra={'team': team_data, 'registration_status': 'rejected', 'next_step': 'registration_closed'},
                )
            if not self._transition_review_status(team=team, target_status='rejected'):
                return self._action_error(
                    message='Only teams pending owner approval can be rejected.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            self._notify_team_decision(team=team, approved=False)

        team_data = self._serialize_team(team)
        return self._action_success(
            message='Team rejected successfully.',
            data={'team': team_data, 'registration_status': 'rejected', 'next_step': 'registration_closed'},
            extra={'team': team_data, 'registration_status': 'rejected', 'next_step': 'registration_closed'},
        )

    @action(detail=True, methods=['post'], url_path='assign-group')
    def assign_group(self, request, pk=None):
        input_serializer = TeamAssignGroupSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        target_group_name = input_serializer.validated_data['group']

        with transaction.atomic():
            team = Team.objects.select_related('tournament', 'tournament__gym').select_for_update().get(
                pk=self.get_object().pk
            )
            self._ensure_owner_or_admin(team)

            if team.tournament.status != 'upcoming':
                return self._action_error(
                    message='Groups can only be assigned while the tournament is upcoming.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            if team.status not in APPROVED_TEAM_STATUSES:
                return self._action_error(
                    message='Only approved teams can be assigned to a group.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            group = create_groups(tournament=team.tournament)
            target_group = next((item for item in group if item.name == target_group_name), None)
            if target_group is None:
                return self._action_error(
                    message='Selected group does not exist for this tournament.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            if team.group_id == target_group.group_id:
                team_data = self._serialize_team(team)
                return self._action_success(
                    message='Team is already assigned to this group.',
                    data={'team': team_data, 'group': target_group.name},
                    extra={'team': team_data, 'group': target_group.name},
                )

            if team.group_id is not None:
                return self._action_error(
                    message='This team has already been assigned to a group.',
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            team.group = target_group
            team.save(update_fields=['group'])

        team_data = self._serialize_team(team)
        return self._action_success(
            message='Team assigned to group successfully.',
            data={'team': team_data, 'group': target_group.name},
            extra={'team': team_data, 'group': target_group.name},
        )


class MatchViewSet(TournamentApiMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only match endpoints; creation happens through tournament action."""

    queryset = Match.objects.select_related('tournament', 'group', 'field', 'team1', 'team2', 'winner_team', 'top_player').all()
    serializer_class = MatchSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return Match.objects.select_related('tournament', 'group', 'field', 'team1', 'team2', 'winner_team', 'top_player').all()
        if user.role == 'owner':
            return Match.objects.select_related('tournament', 'group', 'field', 'team1', 'team2', 'winner_team', 'top_player').filter(tournament__gym__owner=user)
        return Match.objects.select_related('tournament', 'group', 'field', 'team1', 'team2', 'winner_team', 'top_player').filter(tournament__status__in=['upcoming', 'ongoing', 'finished'])

    def _serialize_match(self, match):
        return MatchSerializer(match, context=self.get_serializer_context()).data

    @action(detail=True, methods=['post'])
    def result(self, request, pk=None):
        match = self.get_object()
        user = request.user

        if user.role != 'admin' and (user.role != 'owner' or match.tournament.gym.owner_id != user.user_id):
            return self._action_error(
                message='You do not have permission to record results for this match.',
                status_code=status.HTTP_403_FORBIDDEN,
            )
        if match.tournament.status != 'ongoing':
            return self._action_error(
                message='Results can only be recorded when the tournament is ongoing.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if match.status == 'played':
            return self._action_error(
                message='Match result already recorded.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if match.status == 'cancelled':
            return self._action_error(
                message='Cancelled matches cannot be transitioned to played via result endpoint.',
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        serializer = MatchResultSerializer(data=request.data, context={'match': match})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            match = Match.objects.select_related('tournament').select_for_update().get(pk=match.pk)
            if data['status'] == 'cancelled':
                match.team1_score = None
                match.team2_score = None
                match.winner_team = None
                match.top_player = None
                match.top_player_goals = None
                match.status = 'cancelled'
                match.save(update_fields=['team1_score', 'team2_score', 'winner_team', 'top_player', 'top_player_goals', 'status'])
                match.player_stats.all().delete()
            else:
                match.team1_score = data['team1_score']
                match.team2_score = data['team2_score']
                winner_team_id = data.get('winner_team_id')
                match.winner_team = None
                if winner_team_id is not None:
                    match.winner_team = match.team1 if winner_team_id == match.team1_id else match.team2
                match.top_player = data.get('top_player')
                match.top_player_goals = data.get('top_player_goals')
                match.status = 'played'
                match.save(update_fields=['team1_score', 'team2_score', 'winner_team', 'top_player', 'top_player_goals', 'status'])
                match.player_stats.all().delete()
                MatchPlayerStat.objects.bulk_create(
                    [
                        MatchPlayerStat(
                            match=match,
                            team=stat['team'],
                            player=stat['player'],
                            goals=stat['goals'],
                        )
                        for stat in data.get('player_goal_stats', [])
                    ]
                )
                sync_tournament_after_match_result(tournament=match.tournament)

        match.refresh_from_db()
        match_data = self._serialize_match(match)
        return self._action_success(
            message='Match result recorded successfully.',
            data={'match': match_data},
            extra={'match': match_data},
        )
