from django.contrib import admin
from .models import Match, MatchPlayerStat, Team, TeamMember, Tournament


@admin.register(Tournament)
class TournamentAdmin(admin.ModelAdmin):
    """Admin configuration for the Tournament model."""

    list_display = ('tournament_id', 'name', 'gym', 'sport_type', 'start_date', 'end_date', 'registration_fee', 'first_place_award', 'second_place_award', 'third_place_award', 'top_scorer_award', 'max_teams', 'status', 'champion_team', 'created_at')
    list_filter = ('sport_type', 'status', 'start_date', 'end_date')
    search_fields = ('name', 'gym__name', 'created_by__full_name')
    list_per_page = 25
    ordering = ('-created_at',)


class TeamMemberInline(admin.TabularInline):
    model = TeamMember
    extra = 0
    fields = ('order', 'name', 'role')
    ordering = ('order',)


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    """Admin configuration for the Team model."""

    list_display = ('team_id', 'team_name', 'tournament', 'captain_name', 'captain_phone', 'status', 'created_at')
    list_filter = ('tournament',)
    search_fields = ('team_name', 'tournament__name', 'captain_name', 'members__name')
    list_per_page = 25
    ordering = ('-created_at',)
    inlines = [TeamMemberInline]


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    """Admin configuration for the Match model."""

    list_display = ('match_id', 'tournament', 'field', 'team1', 'team2', 'match_date', 'start_time', 'end_time', 'team1_score', 'team2_score', 'top_player', 'top_player_goals', 'status', 'created_at')
    list_filter = ('status', 'match_date', 'tournament')
    search_fields = ('team1__team_name', 'team2__team_name', 'tournament__name')
    list_per_page = 25
    ordering = ('match_date', 'start_time')


@admin.register(MatchPlayerStat)
class MatchPlayerStatAdmin(admin.ModelAdmin):
    """Admin configuration for per-player match goals."""

    list_display = ('stat_id', 'match', 'team', 'player', 'goals', 'created_at')
    list_filter = ('team', 'match__tournament')
    search_fields = ('player__name', 'team__team_name', 'match__tournament__name')
    list_per_page = 25
