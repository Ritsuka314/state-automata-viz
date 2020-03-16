import * as yup from "yup";
import { toStringArray } from "./parser-utils";

export let StringArraySchema = (transformer) =>
  yup
    .mixed()
    .default([])
    // array.ensure is broken
    .transform(transformer);

export enum AutomatonType {
  fsa = 'fsa',
  pda = 'pda',
  tm = 'tm',
}
export type AutomatonTypeStrings = keyof typeof AutomatonType;

export let FSATransitionSchema = yup.object({
  from: yup.string(),
  read: yup.string(),
  to: yup.string(),
});

export type FSATransition = yup.InferType<typeof FSATransitionSchema>

export let PDATransitionSchema = yup.object({
  from: yup.string(),
  read: yup.string(),
  pop: StringArraySchema(toStringArray),
  push: StringArraySchema(toStringArray),
  to: yup.string(),
});

export type PDATransition = yup.InferType<typeof PDATransitionSchema>

export let TMTransitionSchema = yup.object({
  from: yup.string(),
  read: yup.string(),
  write: yup.string(),
  move: yup.string(),
  to: yup.string(),
});

export type TMTransition = yup.InferType<typeof TMTransitionSchema>
export type Transition = FSATransition | PDATransition | TMTransition;

export type TransitionTable<T extends Transition> = {[state: string] : {[symbol: string]: T[]}};

export type FSATransitionTable = TransitionTable<FSATransition>;
export type PDATransitionTable = TransitionTable<PDATransition>;
export type TMTransitionTable = TransitionTable<TMTransition>;