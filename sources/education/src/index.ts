import { ontologySchema } from '@sak/domain';
import { createHtmlAdapter } from '@sak/source-sdk';
import data from './ontology.json';
import { osymProfile } from './osym';
import { mebProfile } from './meb';
import { yokProfile } from './yok';
import { gsbProfile } from './gsb';
import { yokakProfile } from './yokak';
export const educationOntology = ontologySchema.parse(data);
export const educationProfiles = {
  osym: osymProfile,
  meb: mebProfile,
  yok: yokProfile,
  gsb: gsbProfile,
  yokak: yokakProfile,
};
export function educationAdapters(
  options: Parameters<typeof createHtmlAdapter>[1] = {},
) {
  return new Map(
    Object.values(educationProfiles).map((p) => [
      p.sourceKey,
      createHtmlAdapter(p, options),
    ]),
  );
}
