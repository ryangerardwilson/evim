import assert from "node:assert/strict";
import { test } from "node:test";
import {
  documentFileNameFromName,
  resolveNamedDocumentPath,
  suggestedDocumentPath
} from "../src/documentPaths.js";

test("document name owns the filename when path is a directory", () => {
  assert.equal(documentFileNameFromName("hello.md"), "hello.md");
  assert.equal(resolveNamedDocumentPath("hello.md", "~/Documents/bvim"), "~/Documents/bvim/hello.md");
});

test("document names without extensions become .md filenames", () => {
  assert.equal(suggestedDocumentPath("Hello Notes"), "hello-notes.md");
  assert.equal(resolveNamedDocumentPath("Hello Notes", "~/Documents/bvim/"), "~/Documents/bvim/hello-notes.md");
});

test("full .md path overrides document name path joining", () => {
  assert.equal(
    resolveNamedDocumentPath("Hello Notes", "~/Documents/bvim/custom.md"),
    "~/Documents/bvim/custom.md"
  );
});
