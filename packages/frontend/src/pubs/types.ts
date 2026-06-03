export interface PubType {
  type: string;
  kind: "directory" | "file";
  hasSchema?: boolean;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface PubFile {
  filename: string;
  staged: boolean;
}

export interface PubFileContent {
  type: string;
  filename: string;
  source: "live" | "staging";
  staged: boolean;
  content: string;
}

export interface PubSelection {
  type: string;
  filename: string;
}
