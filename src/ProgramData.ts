import { DataItem } from "./Programs.ts";

export class ProgramData {
  dataIndex: number = 0;
  data: DataItem[];

  constructor(data: DataItem[]) {
    this.data = data;
    this.dataIndex = 0;
  }

  restore(index: number) {
    if (index < 0 || index > this.data.length) {
      throw new Error("invalid restore index");
    }
    this.dataIndex = index;
  }

  read(): DataItem | undefined {
    if (this.dataIndex < this.data.length) {
      return this.data[this.dataIndex++];
    }
  }
}