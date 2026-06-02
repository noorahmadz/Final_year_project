from django.db import models
from django.db.models import F, Q

from apps.gyms.models import Field, Gym
from apps.users.models import User


class Tournament(models.Model):
    """Tournament model for managing sports tournaments."""

    SPORT_TYPE_CHOICES = [
        ('futsal', 'Futsal'),
        ('football', 'Football'),
    ]

    STATUS_CHOICES = [
        ('upcoming', 'Upcoming'),
        ('ongoing', 'Ongoing'),
        ('finished', 'Finished'),
        ('cancelled', 'Cancelled'),
    ]

    tournament_id = models.BigAutoField(primary_key=True)
    gym = models.ForeignKey(
        Gym,
        on_delete=models.CASCADE,
        related_name='tournaments',
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='tournaments_created',
    )
    name = models.CharField(max_length=255)
    sport_type = models.CharField(max_length=20, choices=SPORT_TYPE_CHOICES)
    start_date = models.DateField()
    end_date = models.DateField()
    registration_fee = models.DecimalField(max_digits=12, decimal_places=2)
    prize_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    first_place_award = models.CharField(max_length=255, blank=True, default='')
    second_place_award = models.CharField(max_length=255, blank=True, default='')
    third_place_award = models.CharField(max_length=255, blank=True, default='')
    top_scorer_award = models.CharField(max_length=255, blank=True, default='')
    max_teams = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='upcoming')
    champion_team = models.ForeignKey(
        'Team',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='champion_for_tournaments',
    )
    runner_up_team = models.ForeignKey(
        'Team',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='runner_up_for_tournaments',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tournaments'
        verbose_name = 'Tournament'
        verbose_name_plural = 'Tournaments'
        constraints = [
            models.CheckConstraint(
                check=Q(end_date__gte=F('start_date')),
                name='tournament_end_date_after_start_date',
            ),
            models.CheckConstraint(
                check=Q(max_teams__gte=4),
                name='tournament_max_teams_gte_4',
            ),
            models.CheckConstraint(
                check=Q(status='finished', champion_team__isnull=False, runner_up_team__isnull=False)
                | ~Q(status='finished'),
                name='tournament_finished_requires_ranked_top_two',
            ),
            models.CheckConstraint(
                check=Q(status='finished') | Q(champion_team__isnull=True, runner_up_team__isnull=True),
                name='tournament_non_finished_requires_null_top_two',
            ),
            models.CheckConstraint(
                check=Q(champion_team__isnull=True)
                | Q(runner_up_team__isnull=True)
                | ~Q(champion_team=F('runner_up_team')),
                name='tournament_top_two_must_be_distinct',
            ),
        ]

    def __str__(self):
        return f'{self.name} - {self.sport_type} at {self.gym.name}'


class TournamentGroup(models.Model):
    """Fixed 2-group structure for every tournament."""

    GROUP_NAME_CHOICES = [
        ('A', 'Group A'),
        ('B', 'Group B'),
    ]

    group_id = models.BigAutoField(primary_key=True)
    tournament = models.ForeignKey(
        Tournament,
        on_delete=models.CASCADE,
        related_name='groups',
    )
    name = models.CharField(max_length=1, choices=GROUP_NAME_CHOICES)
    order = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tournament_groups'
        verbose_name = 'Tournament Group'
        verbose_name_plural = 'Tournament Groups'
        ordering = ['order', 'group_id']
        constraints = [
            models.UniqueConstraint(
                fields=['tournament', 'name'],
                name='unique_group_name_per_tournament',
            ),
            models.UniqueConstraint(
                fields=['tournament', 'order'],
                name='unique_group_order_per_tournament',
            ),
        ]

    def __str__(self):
        return f'Group {self.name} - {self.tournament.name}'


class Team(models.Model):
    """Team model for managing tournament teams."""

    STATUS_CHOICES = [
        ('registered', 'Registered'),
        ('pending_owner_approval', 'Pending Owner Approval'),
        ('approved', 'Approved'),
        ('confirmed', 'Confirmed'),
        ('eliminated', 'Eliminated'),
        ('rejected', 'Rejected'),
    ]

    team_id = models.BigAutoField(primary_key=True)
    tournament = models.ForeignKey(
        Tournament,
        on_delete=models.CASCADE,
        related_name='teams',
    )
    group = models.ForeignKey(
        TournamentGroup,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='teams',
    )
    team_name = models.CharField(max_length=255)
    captain_name = models.CharField(max_length=255)
    captain_phone = models.CharField(max_length=20)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='registered')
    final_rank = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'teams'
        verbose_name = 'Team'
        verbose_name_plural = 'Teams'
        ordering = ['created_at', 'team_id']
        constraints = [
            models.UniqueConstraint(
                fields=['tournament', 'captain_phone'],
                name='unique_team_captain_phone_per_tournament',
            ),
            models.UniqueConstraint(
                fields=['tournament', 'team_name'],
                name='unique_team_name_per_tournament',
            ),
            models.UniqueConstraint(
                fields=['tournament', 'final_rank'],
                condition=Q(final_rank__isnull=False),
                name='unique_team_final_rank_per_tournament',
            ),
        ]

    def __str__(self):
        return f'{self.team_name} - {self.tournament.name}'


class TeamMember(models.Model):
    """Registered roster member for a tournament team."""

    member_id = models.BigAutoField(primary_key=True)
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name='members',
    )
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=80)
    order = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'team_members'
        verbose_name = 'Team Member'
        verbose_name_plural = 'Team Members'
        ordering = ['order', 'member_id']
        constraints = [
            models.UniqueConstraint(
                fields=['team', 'order'],
                name='unique_team_member_order_per_team',
            ),
            models.UniqueConstraint(
                fields=['team', 'name'],
                name='unique_team_member_name_per_team',
            ),
        ]

    def __str__(self):
        return f'{self.name} ({self.role}) - {self.team.team_name}'


class Match(models.Model):
    """Tournament match with group and knockout stages."""

    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('played', 'Played'),
        ('cancelled', 'Cancelled'),
    ]

    STAGE_CHOICES = [
        ('group', 'Group Stage'),
        ('knockout_match_1', 'Knockout Match 1'),
        ('knockout_match_2', 'Knockout Match 2'),
        ('knockout_match_3', 'Knockout Match 3'),
    ]

    match_id = models.BigAutoField(primary_key=True)
    tournament = models.ForeignKey(
        Tournament,
        on_delete=models.CASCADE,
        related_name='matches',
    )
    group = models.ForeignKey(
        TournamentGroup,
        on_delete=models.CASCADE,
        related_name='matches',
        null=True,
        blank=True,
    )
    field = models.ForeignKey(
        Field,
        on_delete=models.CASCADE,
        related_name='matches',
    )
    team1 = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name='matches_as_team1',
    )
    team2 = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name='matches_as_team2',
    )
    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default='group')
    stage_order = models.PositiveSmallIntegerField(default=1)
    match_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    team1_score = models.PositiveIntegerField(null=True, blank=True)
    team2_score = models.PositiveIntegerField(null=True, blank=True)
    winner_team = models.ForeignKey(
        Team,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='won_matches',
    )
    top_player = models.ForeignKey(
        TeamMember,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='top_player_matches',
    )
    top_player_goals = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'matches'
        verbose_name = 'Match'
        verbose_name_plural = 'Matches'
        ordering = ['match_date', 'start_time', 'stage_order', 'match_id']
        constraints = [
            models.CheckConstraint(
                check=Q(end_time__gt=F('start_time')),
                name='match_end_time_after_start_time',
            ),
            models.CheckConstraint(
                check=~Q(team1=F('team2')),
                name='match_teams_must_be_different',
            ),
            models.CheckConstraint(
                check=Q(stage='group', group__isnull=False) | ~Q(stage='group'),
                name='group_match_requires_group',
            ),
            models.CheckConstraint(
                check=Q(stage='group') | Q(group__isnull=True),
                name='knockout_match_requires_null_group',
            ),
            models.CheckConstraint(
                check=Q(winner_team__isnull=True) | Q(winner_team=F('team1')) | Q(winner_team=F('team2')),
                name='match_winner_must_be_participant',
            ),
            models.UniqueConstraint(
                fields=['field', 'match_date', 'start_time'],
                name='unique_field_match_start_slot',
            ),
            models.UniqueConstraint(
                fields=['tournament', 'stage'],
                condition=~Q(stage='group'),
                name='unique_knockout_stage_per_tournament',
            ),
            models.UniqueConstraint(
                fields=['tournament', 'group', 'team1', 'team2'],
                condition=Q(stage='group'),
                name='unique_group_match_pair_per_tournament',
            ),
            models.CheckConstraint(
                check=(
                    Q(status='played', team1_score__isnull=False, team2_score__isnull=False)
                    | ~Q(status='played')
                ),
                name='played_match_requires_scores',
            ),
            models.CheckConstraint(
                check=Q(status='played') | Q(team1_score__isnull=True, team2_score__isnull=True, winner_team__isnull=True),
                name='non_played_match_requires_empty_result_fields',
            ),
            models.CheckConstraint(
                check=(
                    Q(status='played', stage='group')
                    | Q(status='played', winner_team__isnull=False)
                    | ~Q(status='played')
                ),
                name='played_knockout_match_requires_winner',
            ),
            models.CheckConstraint(
                check=(
                    Q(status='played', stage='group')
                    | Q(status='played', team1_score__gt=F('team2_score'))
                    | Q(status='played', team2_score__gt=F('team1_score'))
                    | ~Q(status='played')
                ),
                name='played_knockout_match_cannot_have_draw',
            ),
        ]

    def __str__(self):
        return f'{self.team1.team_name} vs {self.team2.team_name} - {self.match_date}'


class MatchPlayerStat(models.Model):
    """Per-player scoring record for a played tournament match."""

    stat_id = models.BigAutoField(primary_key=True)
    match = models.ForeignKey(
        Match,
        on_delete=models.CASCADE,
        related_name='player_stats',
    )
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name='player_match_stats',
    )
    player = models.ForeignKey(
        TeamMember,
        on_delete=models.CASCADE,
        related_name='match_stats',
    )
    goals = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'match_player_stats'
        verbose_name = 'Match Player Stat'
        verbose_name_plural = 'Match Player Stats'
        ordering = ['match_id', 'team_id', 'player__order', 'stat_id']
        constraints = [
            models.UniqueConstraint(
                fields=['match', 'player'],
                name='unique_match_player_stat',
            ),
            models.CheckConstraint(
                check=Q(goals__gt=0),
                name='match_player_stat_goals_positive',
            ),
        ]

    def __str__(self):
        return f'{self.player.name} - {self.goals} goals'
