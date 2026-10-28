export interface ConfiguredCommand {
  source: string;
  script: string | null;
}

export function environmentCommands(assignments: string[]): ConfiguredCommand[];
export function gitConfigCommands(args: string[]): ConfiguredCommand[];
