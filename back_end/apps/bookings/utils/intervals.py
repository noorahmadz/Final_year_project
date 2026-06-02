from __future__ import annotations

from typing import Iterable, List, Sequence, Tuple, TypeVar

T = TypeVar("T")  # typically datetime.time
Interval = Tuple[T, T]


def merge_time_intervals(intervals: Sequence[Interval]) -> List[Interval]:
    """
    Merge overlapping intervals while preserving adjacency boundaries.
    Adjacent intervals where start == previous_end are NOT merged.
    """
    if not intervals:
        return []

    sorted_intervals = sorted(intervals, key=lambda interval: interval[0])
    merged: List[Interval] = [sorted_intervals[0]]

    for start, end in sorted_intervals[1:]:
        last_start, last_end = merged[-1]
        if start < last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))

    return merged


def subtract_intervals(slot_start: T, slot_end: T, booked_ranges: Iterable[Interval]) -> List[Interval]:
    """
    Subtract booked_ranges from [slot_start, slot_end) and return available ranges.
    """
    available: List[Interval] = []
    cursor = slot_start

    for booked_start, booked_end in booked_ranges:
        if booked_end <= slot_start or booked_start >= slot_end:
            continue

        effective_start = max(booked_start, slot_start)
        effective_end = min(booked_end, slot_end)

        if effective_start > cursor:
            available.append((cursor, effective_start))

        cursor = max(cursor, effective_end)
        if cursor >= slot_end:
            break

    if cursor < slot_end:
        available.append((cursor, slot_end))

    return available

