// use server'
'use server';

/**
 * @fileOverview An AI agent that categorizes patient observations to facilitate triage and care planning.
 *
 * - categorizePatientObservations - A function that handles the categorization of patient observations.
 * - CategorizePatientObservationsInput - The input type for the categorizePatientObservations function.
 * - CategorizePatientObservationsOutput - The return type for the categorizePatientObservations function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CategorizePatientObservationsInputSchema = z.object({
  observations: z
    .string()
    .describe('The observations about the patient that need to be categorized.'),
});
export type CategorizePatientObservationsInput = z.infer<
  typeof CategorizePatientObservationsInputSchema
>;

const CategorizePatientObservationsOutputSchema = z.object({
  category: z
    .string()
    .describe(
      'The category that the observations fall into, such as "Routine Checkup", "Urgent", "Follow-up", etc.'
    ),
  reason: z
    .string()
    .describe(
      'The reasoning behind the categorization, explaining why the observations were assigned to this category.'
    ),
});
export type CategorizePatientObservationsOutput = z.infer<
  typeof CategorizePatientObservationsOutputSchema
>;

export async function categorizePatientObservations(
  input: CategorizePatientObservationsInput
): Promise<CategorizePatientObservationsOutput> {
  return categorizePatientObservationsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'categorizePatientObservationsPrompt',
  input: {schema: CategorizePatientObservationsInputSchema},
  output: {schema: CategorizePatientObservationsOutputSchema},
  prompt: `You are an expert medical assistant specializing in categorizing patient observations for triage and care planning.

  Given the following observations about a patient, determine the most appropriate category for these observations and provide a brief reason for your choice.

  Observations: {{{observations}}}

  Category and Reasoning:`,
});

const categorizePatientObservationsFlow = ai.defineFlow(
  {
    name: 'categorizePatientObservationsFlow',
    inputSchema: CategorizePatientObservationsInputSchema,
    outputSchema: CategorizePatientObservationsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
