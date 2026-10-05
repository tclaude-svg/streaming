// All interface text lives here so Russian and Korean can be added later
// (phase 2) by adding strings.ru.js / strings.ko.js without redesigning.
export default {
  siteName: 'TIS Owls Live',
  tagline: 'Challenge | Explore | Connect',
  metaDescription: 'Watch Tashkent International School Owls games live or as replays. Football, basketball and volleyball.',
  skip: 'Skip to content',
  cta: 'Find a game',
  nav: { schedule: 'Live & Schedule', replays: 'Replays', teams: 'Teams', about: 'About' },
  sports: { football: 'Football', basketball: 'Basketball', volleyball: 'Volleyball' },
  levels: { varsity: 'Varsity', jv: 'Junior Varsity' },
  levelsShort: { varsity: 'Varsity', jv: 'JV' },
  filters: { all: 'All', sport: 'Sport', level: 'Level', none: 'No games match these filters.' },
  status: { live: 'Live', scheduled: 'Upcoming', final: 'Final' },
  owls: 'Owls',
  vs: 'vs',
  hero: {
    liveNow: 'Live now',
    nextGame: 'Next game',
    watchLive: 'Watch live',
    gameDetails: 'Game details',
    emptyTitle: 'No games scheduled',
    emptyText: 'The next fixtures will appear here. Meanwhile, catch up on replays.',
    browseReplays: 'Browse replays',
    days: 'days', hours: 'hours', minutes: 'min'
  },
  home: { thisWeek: 'Coming up', latestReplays: 'Latest replays', allSchedule: 'Full schedule', allReplays: 'All replays' },
  schedule: { title: 'Live & Schedule', intro: 'Times are shown in Tashkent time (UTC+5), with your local time when it is different.', yourTime: 'your time', empty: 'No upcoming games yet.' },
  replays: { title: 'Replays', intro: 'Every home game, available within 24 hours.', empty: 'Replays will appear here after the first game.' },
  teams: { title: 'Teams', upcoming: 'Upcoming', results: 'Results and replays', nextPrefix: 'Next', noNext: 'No game scheduled', noResults: 'No results yet.' },
  game: {
    share: 'Share', copied: 'Link copied', addToCalendar: 'Add to calendar', nextUp: 'Next up',
    venue: 'Venue', kickoff: 'Start',
    videoScheduled: 'The stream opens shortly before the start.',
    videoLiveNoStream: 'The stream is starting. This page updates by itself.',
    videoFinalNoReplay: 'The replay will be published within 24 hours of the final whistle.'
  },
  about: {
    title: 'About',
    // DRAFT TEXT - to be confirmed with the school (see docs/OPEN-DECISIONS.md)
    howTitle: 'How to watch',
    how: 'Open the home page. When a game is live you will see "Live now" with a Watch live button. No account or login is needed. Replays are added within 24 hours.',
    whoTitle: 'Who runs the streams',
    who: '[To be confirmed: athletics office and/or student media crew]',
    contactTitle: 'Contact',
    contact: '[Athletics office contact - to be confirmed]',
    privacyTitle: 'Privacy and child safety',
    privacy: 'This site has no accounts, comments or chat. We do not collect personal data about students, and analytics are anonymous. Titles and captions use team names, not student surnames.',
    takedownTitle: 'Request a removal',
    takedown: 'Any family or staff member can ask for a video to be removed. Requests are handled within 24 hours by [named person - to be confirmed].'
  },
  footer: { school: 'Tashkent International School' }
};
