export let automatonTypes = ['fsa', 'pda', 'tm'];

export type FSATransition = {from: string, read: string, to: string}
export type PDATransition = {from: string, read: string, push: string[], pop: string[], to: string}
export type TMTransition = {from: string, read: string, write: string, move: string, to: string}
export type Transition = FSATransition | PDATransition | TMTransition;

export type TransitionTable<T extends Transition> = {[state: string] : {[symbol: string]: T[]}};

export type FSATransitionTable = TransitionTable<FSATransition>;
export type PDATransitionTable = TransitionTable<PDATransition>;
export type TMTransitionTable = TransitionTable<TMTransition>;
