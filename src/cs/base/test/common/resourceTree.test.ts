import assert from "assert";

import { extUriIgnorePathCase } from "../../common/resources.ts";
import { ResourceTree } from "../../common/resourceTree.ts";
import { URI } from "../../common/uri.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/resourceTree", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("creates an empty root node", () => {
		const tree = new ResourceTree<string, null>(null);

		assert.equal(tree.root.childrenCount, 0);
		assert.equal(tree.root.name, "");
		assert.equal(tree.root.relativePath, "");
	});

	test("adds, overwrites, gets, and deletes resource leaves", () => {
		const tree = new ResourceTree<string, null>(null);

		tree.add(URI.file("/foo/bar.txt"), "bar contents");
		assert.equal(tree.root.childrenCount, 1);

		const foo = tree.root.get("foo");
		assert.ok(foo);
		assert.equal(foo.name, "foo");
		assert.equal(foo.childrenCount, 1);

		const bar = foo.get("bar.txt");
		assert.ok(bar);
		assert.equal(bar.name, "bar.txt");
		assert.equal(bar.element, "bar contents");
		assert.equal(tree.getNode(URI.file("/foo/bar.txt")), bar);
		assert.equal(ResourceTree.getRoot(bar), tree.root);
		assert.equal(ResourceTree.isResourceNode(bar), true);

		tree.add(URI.file("/foo/bar.txt"), "updated contents");
		assert.equal(tree.getNode(URI.file("/foo/bar.txt"))?.element, "updated contents");

		tree.add(URI.file("/hello.txt"), "hello contents");
		assert.equal(tree.root.childrenCount, 2);
		assert.equal(tree.delete(URI.file("/foo/bar.txt")), "updated contents");
		assert.equal(tree.root.childrenCount, 1);
		assert.equal(tree.getNode(URI.file("/hello.txt"))?.element, "hello contents");
	});

	test("supports folders with data", () => {
		const tree = new ResourceTree<string, null>(null);

		tree.add(URI.file("/foo"), "foo");
		tree.add(URI.file("/bar"), "bar");
		tree.add(URI.file("/foo/file.txt"), "file");

		assert.equal(tree.root.childrenCount, 2);
		assert.equal(tree.root.get("foo")?.element, "foo");
		assert.equal(tree.root.get("bar")?.element, "bar");
		assert.equal(tree.root.get("foo")?.get("file.txt")?.element, "file");
		assert.deepEqual(ResourceTree.collect(tree.root), ["foo", "file", "bar"]);

		assert.equal(tree.delete(URI.file("/foo")), "foo");
		assert.equal(tree.root.childrenCount, 1);
		assert.equal(tree.root.get("foo"), undefined);
		assert.equal(tree.root.get("bar")?.element, "bar");
	});

	test("uses the configured root URI and context", () => {
		const root = URI.file("/workspace");
		const tree = new ResourceTree("context", root, extUriIgnorePathCase);

		tree.add(URI.file("/workspace/folder/sample.csv"), "sample");

		const folder = tree.root.get("folder");
		assert.ok(folder);
		assert.equal(folder.context, "context");
		assert.equal(folder.relativePath, "/folder");
		assert.equal(folder.uri.path, "/workspace/folder");

		const sample = folder.get("sample.csv");
		assert.ok(sample);
		assert.equal(sample.context, "context");
		assert.equal(sample.relativePath, "/folder/sample.csv");
		assert.equal(sample.uri.path, "/workspace/folder/sample.csv");
		assert.equal(sample.element, "sample");
	});

	test("clears all child nodes", () => {
		const tree = new ResourceTree<string, null>(null);

		tree.add(URI.file("/foo/bar.txt"), "bar");
		tree.add(URI.file("/hello.txt"), "hello");
		tree.clear();

		assert.equal(tree.root.childrenCount, 0);
		assert.equal(tree.getNode(URI.file("/foo/bar.txt")), undefined);
	});
});
