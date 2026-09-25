export const figures = Object.freeze({
  broadband: {
    evidenceClass: 'Official series',
    mandatoryCaption: 'Broadband subscriptions, not unique people or music listeners.',
    historical: [
      ['2014–15', 16885518], ['2015–16', 40147991], ['2016–17', 44586733],
      ['2017–18', 58339814], ['2018–19', 71026087], ['2019–20', 83205589],
      ['2020–21', 102699967],
    ].map(([period, subscriptions]) => ({ period, subscriptions })),
    current: [
      ['2021–22', 119, 51.0], ['2022–23', 127, 53.6], ['2023–24', 139, 57.0],
      ['2024–25', 150, 60.6], ['March 2026', 161, 64.2],
    ].map(([period, subscriptionsMillions, penetrationPercent]) => ({ period, subscriptionsMillions, penetrationPercent })),
  },
  traffic: [
    ['2021–22', 8970, 7280, 16250, false], ['2022–23', 10850, 9385, 20235, false],
    ['2023–24', 13021, 12120, 25141, false], ['2024–25', 14153, 13574, 27727, false],
    ['2025–26 estimate', 15851, 14931, 30783, true],
  ].map(([period, mobilePb, fixedPb, officialTotalPb, estimated]) => ({ period, mobilePb, fixedPb, officialTotalPb, estimated })),
  livelihood: [
    ['KP, Balochistan, and Gilgit-Baltistan', 30, 73, 70, 10],
    ['Sindh', 10, 60, 50, 10], ['Punjab', 10, 80, 40, 20],
  ].map(([region, sample, projectPaidPercent, around35000Percent, above100000Percent]) => ({ region, sample, projectPaidPercent, around35000Percent, above100000Percent })),
  spotifyPulse: [
    ['Listenership since launch', '>750%', 'Platform-reported'],
    ['Pakistani-artist streams since 2021', '>7×', 'Platform-reported'],
    ['Represented Pakistani artists', 'nearly +75%', 'Platform-reported'],
    ['Playlists created', '>15 million', 'Platform-reported'],
    ['Artists streamed per average listener per year', '>140', 'Platform-reported'],
  ].map(([label, value, evidenceClass]) => ({ label, value, evidenceClass })),
  evidenceMatrix: {
    columns: ['Administrative', 'Platform public', 'Industry documents', 'Interviews', 'Content'],
    rows: [
      ['Cultural production', 1, 2, 2, 4, 4],
      ['Audience attention', 1, 4, 2, 2, 2],
      ['Economic sustainability', 1, 1, 1, 4, 1],
      ['Institutional maturity', 2, 2, 3, 4, 1],
      ['Social inclusion', 2, 2, 1, 4, 4],
      ['Internationalization', 1, 3, 3, 3, 2],
    ].map(([dimension, ...scores]) => ({ dimension, scores })),
  },
});
