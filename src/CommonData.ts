import { Type } from "./Types.ts";
import { ArrayBounds, Variable } from "./Variables.ts";

export class CommonValue {
  type: Type;
  dimensions?: ArrayBounds[];
  bytes: Uint8Array;
}

export class CommonData {
  chainVariables: Variable[] = [];
  serializedValues: CommonValue[];

  constructor(other?: CommonData) {
    this.serializedValues = other?.serializedValues ?? [];
  }

  assign(variable: Variable): CommonValue | undefined {
    this.chainVariables.push(variable);
    return this.serializedValues.shift();
  }

  toJson(): string {
    return JSON.stringify(this.serializedValues, (key, value) => {
      switch (key) {
        case 'bytes':
          return Array.from(value);
        default:
          return value;
      }
    });
  }

  static fromJson(json: string): CommonData {
    const data = new CommonData();
    data.serializedValues = JSON.parse(json, (key, value) => {
      switch (key) {
        case 'bytes':
          return new Uint8Array(value);
        default:
          return value;
      }
    });
    return data;
  }
}