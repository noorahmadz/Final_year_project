REQUIRED_TEAM_MEMBER_COUNT = 7
TEAM_MEMBER_NAME_MAX_LENGTH = 255
TEAM_MEMBER_ROLE_MAX_LENGTH = 80


def normalize_team_members(members):
    if not isinstance(members, list):
        raise ValueError(f'Exactly {REQUIRED_TEAM_MEMBER_COUNT} team members are required.')
    if len(members) != REQUIRED_TEAM_MEMBER_COUNT:
        raise ValueError(f'Exactly {REQUIRED_TEAM_MEMBER_COUNT} team members are required.')

    normalized = []
    seen_names = set()
    for index, member in enumerate(members, start=1):
        if not isinstance(member, dict):
            raise ValueError(f'Team member {index} must include name and role.')

        name = str(member.get('name', '')).strip()
        role = str(member.get('role', '')).strip()
        if not name or not role:
            raise ValueError(f'Team member {index} requires both name and role.')
        if len(name) > TEAM_MEMBER_NAME_MAX_LENGTH:
            raise ValueError(f'Team member {index} name is too long.')
        if len(role) > TEAM_MEMBER_ROLE_MAX_LENGTH:
            raise ValueError(f'Team member {index} role is too long.')

        name_key = name.casefold()
        if name_key in seen_names:
            raise ValueError('Team member names must be unique.')
        seen_names.add(name_key)
        normalized.append({'name': name, 'role': role})

    return normalized


def create_team_members(*, team, members):
    from .models import TeamMember

    normalized = normalize_team_members(members)
    TeamMember.objects.bulk_create(
        [
            TeamMember(
                team=team,
                name=member['name'],
                role=member['role'],
                order=index,
            )
            for index, member in enumerate(normalized, start=1)
        ]
    )
    return normalized
