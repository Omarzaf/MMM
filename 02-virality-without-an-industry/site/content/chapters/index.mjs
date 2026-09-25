import opening from './00-opening.mjs';
import infrastructure from './01-infrastructure.mjs';
import distribution from './02-distribution.mjs';
import evidence from './03-evidence.mjs';
import propositions from './04-propositions.mjs';
import pathways from './05-pathways.mjs';
import methods from './06-methods.mjs';
import rights from './07-rights.mjs';
import linerNotes from './08-liner-notes.mjs';

export const chapters = [opening, infrastructure, distribution, evidence, propositions, pathways, methods, rights, linerNotes];

export function countNarrativeWords(items) {
  return items.flatMap(({ blocks, establishes, unknown }) => [
    ...blocks.filter(({ kind }) => kind === 'paragraph').map(({ text }) => text),
    establishes,
    unknown,
  ]).join(' ').trim().split(/\s+/u).filter(Boolean).length;
}
