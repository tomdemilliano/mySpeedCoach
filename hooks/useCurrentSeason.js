// hooks/useCurrentSeason.js
//
// Resolves the current season for a given club.
// "Current" = the season whose startDate <= today <= endDate and isAbandoned !== true.
//
// Also computes whether the "create new season" banner should be shown:
// fires when today is within 30 days of the next occurrence of the club's
// seasonStartDay/seasonStartMonth AND no season exists yet covering that date.
//
// Usage:
//   const { currentSeason, upcomingSeason, showBanner, loading } = useCurrentSeason(clubId, club);

import { useState, useEffect } from 'react';
import { SeasonFactory } from '../constants/dbSchema';

// Returns the next Date on which day/month occurs (this year or next year).
function nextOccurrence(day, month) {
  const now   = new Date();
  const thisYear = new Date(now.getFullYear(), month - 1, day);
  if (thisYear >= now) return thisYear;
  return new Date(now.getFullYear() + 1, month - 1, day);
}

export function useCurrentSeason(clubId, club) {
  const [seasons,       setSeasons]       = useState([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    if (!clubId) { setLoading(false); return; }
    const unsub = SeasonFactory.getAll(clubId, (data) => {
      setSeasons(data);
      setLoading(false);
    });
    return () => unsub();
  }, [clubId]);

  const now = new Date();

  // Current season: startDate <= today <= endDate, not abandoned
  const currentSeason = seasons.find(s => {
    if (s.isAbandoned) return false;
    const start = s.startDate?.seconds ? new Date(s.startDate.seconds * 1000) : null;
    const end   = s.endDate?.seconds   ? new Date(s.endDate.seconds   * 1000) : null;
    if (!start || !end) return false;
    return start <= now && now <= end;
  }) || null;

  // Banner logic
  let showBanner = false;
  let upcomingStart = null;

  if (club?.seasonStartDay && club?.seasonStartMonth) {
    upcomingStart = nextOccurrence(club.seasonStartDay, club.seasonStartMonth);
    const daysUntil = (upcomingStart - now) / (1000 * 60 * 60 * 24);

    if (daysUntil <= 30) {
      // Check if a season already covers the upcoming start date
      const alreadyExists = seasons.some(s => {
        if (s.isAbandoned) return false;
        const start = s.startDate?.seconds ? new Date(s.startDate.seconds * 1000) : null;
        const end   = s.endDate?.seconds   ? new Date(s.endDate.seconds   * 1000) : null;
        if (!start || !end) return false;
        return start <= upcomingStart && upcomingStart <= end;
      });
      showBanner = !alreadyExists;
    }
  }

  return { currentSeason, seasons, showBanner, upcomingStart, loading };
}
