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
  /** Extracted from the file's top-level `name` field. Null when no name field
   *  exists (e.g. a malformed file or a type whose record shape has no name). */
  name?: string | null;
}

export interface PubFileContent {
  type: string;
  filename: string;
  source: "live" | "staging";
  staged: boolean;
  content: string;
  schema?: object | null;
}

export interface PubSelection {
  type: string;
  filename: string;
}
