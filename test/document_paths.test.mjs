import assert from "node:assert/strict";
import { test } from "node:test";
import {
  documentFileNameFromName,
  documentTitleFromPath,
  resolveNamedDocumentPath,
  suggestedDocumentPath
} from "../src/documentPaths.js";

test("document name owns the filename when path is a directory", () => {
  assert.equal(documentFileNameFromName("hello.md"), "hello.md");
  assert.equal(resolveNamedDocumentPath("hello.md", "~/Documents/evim"), "~/Documents/evim/hello.md");
});

test("document names without extensions become .md filenames", () => {
  assert.equal(suggestedDocumentPath("Hello Notes"), "hello-notes.md");
  assert.equal(resolveNamedDocumentPath("Hello Notes", "~/Documents/evim/"), "~/Documents/evim/hello-notes.md");
});

test("full .md path overrides document name path joining", () => {
  assert.equal(
    resolveNamedDocumentPath("Hello Notes", "~/Documents/evim/custom.md"),
    "~/Documents/evim/custom.md"
  );
});

test("document titles can be derived from a typed path", () => {
  assert.equal(documentTitleFromPath("~/Documents/evim/project-notes.md"), "project notes");
  assert.equal(documentTitleFromPath("scratch_note"), "scratch note");
});
