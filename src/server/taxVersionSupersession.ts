import type { TaxOfficialSource, TaxRuleVersion } from '../tax/types';

export interface SourceSupersessionMutation {
  previous: TaxOfficialSource;
  next: TaxOfficialSource;
}

export interface RuleSupersessionMutation {
  previous: TaxRuleVersion;
  next: TaxRuleVersion;
}

/**
 * Build immutable-history source retirement mutations.
 *
 * Important governance boundary: this function never invents or rewrites
 * publication/effective dates. Those fields are official-source evidence and
 * remain exactly as captured on the predecessor. Supersession changes only
 * lifecycle/link metadata so historical source versions remain inspectable.
 */
export function planOfficialSourceSupersession(
  successor: TaxOfficialSource,
  predecessors: TaxOfficialSource[],
  now: string
): { mutations: SourceSupersessionMutation[]; error: string | null } {
  const requestedIds = Array.from(new Set(successor.supersedesSourceIds || []));
  if (requestedIds.length === 0) return { mutations: [], error: null };
  if (requestedIds.includes(successor.id)) {
    return { mutations: [], error: 'An official source cannot supersede itself.' };
  }

  const byId = new Map(predecessors.map(source => [source.id, source]));
  const mutations: SourceSupersessionMutation[] = [];
  for (const sourceId of requestedIds) {
    const previous = byId.get(sourceId);
    if (!previous) return { mutations: [], error: `Superseded official source ${sourceId} does not exist.` };
    if (previous.status === 'superseded') {
      if (previous.supersededBySourceId === successor.id) continue;
      return { mutations: [], error: `Official source ${sourceId} is already superseded by another source version.` };
    }
    const next: TaxOfficialSource = {
      ...previous,
      status: 'superseded',
      supersededBySourceId: successor.id,
      updatedAt: now
    };
    mutations.push({ previous, next });
  }
  return { mutations, error: null };
}

/**
 * Build the retirement mutation for an accepted predecessor rule.
 * Effective dates and the predecessor's full evidence remain untouched; the
 * successor relationship is lifecycle metadata only.
 */
export function planTaxRuleSupersession(
  successor: TaxRuleVersion,
  predecessor: TaxRuleVersion | null,
  now: string
): { mutation?: RuleSupersessionMutation; error: string | null } {
  const predecessorId = String(successor.supersedesRuleId || '').trim();
  if (!predecessorId) return { error: null };
  if (predecessorId === successor.id) return { error: 'A tax rule version cannot supersede itself.' };
  if (!predecessor) return { error: `Superseded tax rule ${predecessorId} does not exist.` };
  if (predecessor.id !== predecessorId) return { error: 'Superseded tax rule identity mismatch.' };
  if (predecessor.code !== successor.code || predecessor.domain !== successor.domain) {
    return { error: 'A tax rule version may supersede only the same rule code in the same tax domain.' };
  }
  if (predecessor.status === 'superseded') {
    if (predecessor.supersededByRuleId === successor.id) return { error: null };
    return { error: `Tax rule ${predecessor.id} is already superseded by another rule version.` };
  }
  if (predecessor.status !== 'accepted') {
    return { error: 'Only an accepted predecessor tax rule version may be superseded.' };
  }

  return {
    mutation: {
      previous: predecessor,
      next: {
        ...predecessor,
        status: 'superseded',
        supersededByRuleId: successor.id,
        updatedAt: now
      }
    },
    error: null
  };
}
