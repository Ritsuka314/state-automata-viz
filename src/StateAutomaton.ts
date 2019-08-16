import { Transition } from "./TransitionSpec";

export type TransitionLUT<T extends Transition> = (from: string, symbol: string) => T[];

export abstract class StateAutomaton<T extends Transition> {
  public states: string[];

  public abstract toString(): string;

  /**
   * Step to the next configuration according to the transition function.
   * @return {boolean} true if successful (the transition is defined),
   *   false otherwise (machine halted)
   */
  public abstract step(): boolean;

  public abstract get isHalted(): boolean;
}
