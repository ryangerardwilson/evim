import assert from "node:assert/strict";
import { test } from "node:test";
import {
  documentFileNameFromName,
  resolveNamedDocumentPath,
  suggestedDocumentPath
} from "../src/documentPaths.js";

test("document name owns the filename when path is a directory", () => {
  assert.equal(documentFileNameFromName("hello.bvim"), "hello.bvim");
  assert.equal(resolveNamedDocumentPath("hello.bvim", "~/Documents/bvim"), "~/Documents/bvim/hello.bvim");
});

test("document names without extensions become .bvim filenames", () => {
  assert.equal(suggestedDocumentPath("Hello Notes"), "hello-notes.bvim");
  assert.equal(resolveNamedDocumentPath("Hello Notes", "~/Documents/bvim/"), "~/Documents/bvim/hello-notes.bvim");
});

test("full .bvim path overrides document name path joining", () => {
  assert.equal(
    resolveNamedDocumentPath("Hello Notes", "~/Documents/bvim/custom.bvim"),
    "~/Documents/bvim/custom.bvim"
  );
});
