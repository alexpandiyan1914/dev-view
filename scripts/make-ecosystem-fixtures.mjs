// Creates small Node.js and Python folders in your temp folder, some healthy and some not.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const base = join(tmpdir(), "dev-view-ecosystems");
rmSync(base, { recursive: true, force: true });

const folders = {
  "node-bad": {
    "package.json": JSON.stringify(
      {
        version: "1.0.0",
        main: "index.js",
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
        dependencies: { express: "^4.19.0" },
        devDependencies: { express: "^4.19.0" },
      },
      null,
      2,
    ),
    "index.js": "console.log('hi');\n",
  },
  "node-good": {
    "package.json": JSON.stringify(
      {
        name: "node-good",
        version: "1.0.0",
        description: "A healthy example package",
        license: "MIT",
        main: "dist/index.js",
        files: ["dist"],
        engines: { node: ">=20" },
        scripts: { test: "vitest run" },
        dependencies: { express: "^4.19.0" },
        devDependencies: { vitest: "^2.0.0" },
      },
      null,
      2,
    ),
    "package-lock.json": "{}\n",
    "src/index.js": "console.log('hi');\n",
    "tests/app.test.js": "// a test\n",
  },
  "python-bad": {
    "requirements.txt": "flask==3.0.0\nrequests\nnumpy  # math\n",
    "app.py": "print('hi')\n",
  },
  "python-good": {
    "requirements.txt": "flask==3.0.0\nrequests==2.32.3\n",
    "pyproject.toml": '[project]\nname = "python-good"\nrequires-python = ">=3.10"\n',
    "app.py": "print('hi')\n",
    "tests/test_app.py": "def test_ok():\n    assert True\n",
  },
};

for (const [name, files] of Object.entries(folders)) {
  for (const [file, content] of Object.entries(files)) {
    const target = join(base, name, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
console.log("Created in", base);