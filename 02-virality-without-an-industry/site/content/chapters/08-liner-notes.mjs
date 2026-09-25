export default {
  id: 'liner-notes',
  number: '08',
  group: 'Liner Notes',
  title: 'Sources, downloads, and open questions',
  wordBudget: [200, 350],
  blocks: [
    {
      kind: 'paragraph',
      text: 'The liner notes are part of the argument, not a backstage appendix. The source list keeps the 42-source starter archive apart from a clearly labelled set of sources added in later research, and the source registry below counts them directly from the public source data. The bibliography keeps scholarship, official records, platform statements, journalism, and policy documents visible as different kinds of support. That separation lets a reader see why one paragraph can support a timeline, another an artist’s route, and another only an unanswered question.',
      sourceIds: [],
      localRefs: ['source_map.csv', 'annotated_bibliography.csv'],
      claimMode: 'context',
    },
    { kind: 'registry', moduleId: 'source-registry' },
    {
      kind: 'paragraph',
      text: 'The download shelf holds exactly eleven files from the research package: the source map, annotated bibliography, proposition matrix, analysis plan, data collection protocol, interview guide, content analysis codebook, research ethics protocol, fieldwork schedule, track dataset codebook, and artist dataset codebook. Every link points to a file in the package. Photo credits and licences belong here too. Images still waiting for permission are listed apart from those cleared for use, so that a newspaper thumbnail, a platform post, or a label image is never mistaken for permission to reuse it.',
      sourceIds: [],
      localRefs: ['source_map.csv', 'annotated_bibliography.csv', 'proposition_matrix.csv', 'analysis_plan.md', 'data_collection_protocol.md', 'interview_guide.md', 'content_analysis_codebook.md', 'research_ethics_protocol.md', 'fieldwork_schedule.csv', 'track_dataset_codebook.csv', 'artist_dataset_codebook.csv'],
      claimMode: 'context',
    },
    { kind: 'downloads', moduleId: 'downloads' },
    {
      kind: 'paragraph',
      text: 'The most valuable unknowns are practical: who owns what, who was paid, which middlemen had power, which artists could not get in, which cities and languages were missed, which venues kept musicians working, and whether policy recognition turned into working administration. These questions deliberately come before a cleaner ending. A source registry can make the public record transparent. It cannot pretend the missing records have already arrived.',
      sourceIds: ['S012', 'S027', 'S028', 'L016', 'L018', 'L022', 'L023'],
      claimMode: 'synthesis',
    },
  ],
  establishes: 'The page shows its source registry, bibliography, photo credits, downloads, pending permission requests, and most urgent unknowns as part of the reading.',
  unknown: 'The liner notes cannot stand in for access to contracts, payments, platform dashboards, venue records, missing sampling materials, or permissions not yet granted.',
};
