import assert from "node:assert/strict";
import { test } from "node:test";
import {
  moveNoteIndexSelection,
  noteAtIndexSelection,
  noteEntryFromMarkdownFile,
  organizeNoteIndex,
  selectedNoteIndex
} from "@ryangerardwilson/bvim-markdown";

test("markdown files become note index entries", () => {
  assert.deepEqual(noteEntryFromMarkdownFile({ relativePath: "math/calculus_i.md", markdown: "# Calculus I\n" }), {
    slug: "math/calculus_i",
    title: "Calculus I",
    source: "/content/math/calculus_i.md",
    href: "/math/calculus_i"
  });
});

test("note index groups notes by slug path", () => {
  const index = organizeNoteIndex([
    { slug: "writing/zeta", title: "Zeta" },
    { slug: "math/calculus_i", title: "Calculus I" },
    { slug: "math/algebra", title: "Algebra" }
  ]);

  assert.deepEqual(
    index.groups.map((group) => [group.key, group.notes.map((note) => note.slug)]),
    [
      ["math", ["math/algebra", "math/calculus_i"]],
      ["writing", ["writing/zeta"]]
    ]
  );
  assert.equal(index.notes[0].index, 0);
});

test("note index selection movement clamps like vim list navigation", () => {
  const index = organizeNoteIndex([{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);

  assert.equal(selectedNoteIndex(index, "b"), 1);
  assert.equal(moveNoteIndexSelection(0, -1, index), 0);
  assert.equal(moveNoteIndexSelection(0, 1, index), 1);
  assert.equal(moveNoteIndexSelection(1, 1, index), 1);
  assert.deepEqual(noteAtIndexSelection(index, 12), index.notes[1]);
});
