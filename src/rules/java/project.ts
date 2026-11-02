import { hasRootFile, readRootFile } from "../../core/files.js";
import type { Finding, ProjectContext } from "../../types/result.js";

const CATEGORY = "Java";

type Draft = Omit<Finding, "category">;
const make = (draft: Draft): Finding => ({ category: CATEGORY, ...draft });

const GRADLE_FILES = ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"];
const GRADLE_BUILD_FILES = ["build.gradle", "build.gradle.kts"];

const usesMaven = (ctx: ProjectContext): boolean => hasRootFile(ctx, "pom.xml");
const usesGradle = (ctx: ProjectContext): boolean => GRADLE_FILES.some((f) => hasRootFile(ctx, f));

/** Reads and joins several root files. Missing files are skipped. */
async function readAll(ctx: ProjectContext, names: string[]): Promise<string> {
  const texts = await Promise.all(names.map((name) => readRootFile(ctx, name)));
  return texts.filter((t): t is string => t !== null).join("\n");
}

/** Removes XML and Gradle comments so that commented-out lines do not count. */
function stripComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

// ---- Java version ---------------------------------------------------------------------------------

const VERSION_FILES = [".java-version", ".sdkmanrc", ".tool-versions"];

const MAVEN_VERSION = /<(maven\.compiler\.(source|target|release)|java\.version|release)>|<(source|target)>\s*\d/;
const GRADLE_VERSION =
  /sourceCompatibility|targetCompatibility|JavaLanguageVersion|jvmToolchain|JavaVersion\.VERSION_|options\.release/;

export async function checkJavaVersion(ctx: ProjectContext): Promise<Finding[]> {
  const pom = stripComments((await readRootFile(ctx, "pom.xml")) ?? "");
  const gradle = stripComments(await readAll(ctx, GRADLE_BUILD_FILES));

  const declared =
    VERSION_FILES.some((f) => hasRootFile(ctx, f)) || MAVEN_VERSION.test(pom) || GRADLE_VERSION.test(gradle);

  if (declared) {
    return [
      make({
        ruleId: "java.version-declared",
        severity: "pass",
        title: "Java version declared",
        message: "The project states which Java version it needs",
      }),
    ];
  }

  return [
    make({
      ruleId: "java.version-declared",
      severity: "info",
      title: "No Java version declared",
      message: "No compiler release in the build file and no .java-version file",
      why: "Code written for Java 21 may not compile on Java 8. Without a stated version, people only find out when the build fails.",
      suggestion: usesMaven(ctx)
        ? "In pom.xml, add <maven.compiler.release>21</maven.compiler.release> under <properties>."
        : "In build.gradle, add java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }.",
    }),
  ];
}

// ---- Tests ----------------------------------------------------------------------------------------

// Maven and Gradle both keep tests in src/test (Android also uses src/androidTest).
const TEST_FOLDER = /(^|\/)src\/(test|androidTest|integrationTest)\/.+\.(java|kt|groovy|scala)$/i;
// Or files named like FooTest.java, FooTests.java, FooIT.java
const TEST_FILE = /(^|\/)[^/]*(Test|Tests|IT)\.(java|kt)$/;
const IGNORED_PATH = /(^|\/)(target|build|out|__fixtures__|fixtures)\//i;

export function checkJavaTests(ctx: ProjectContext): Finding[] {
  const found = ctx.files.some((f) => !IGNORED_PATH.test(f.path) && (TEST_FOLDER.test(f.path) || TEST_FILE.test(f.path)));

  if (found) {
    return [
      make({
        ruleId: "java.tests-exist",
        severity: "pass",
        title: "Test files found",
        message: "The project contains test files",
      }),
    ];
  }

  return [
    make({
      ruleId: "java.tests-exist",
      severity: "warning",
      title: "No test files found",
      message: "Nothing under src/test and no *Test.java files",
      why: "Tests catch mistakes before your users do, and they let you change code without fear of breaking it.",
      suggestion:
        "Create src/test/java with one test for your most important class (JUnit 5 works with both Maven and Gradle), then run 'mvn test' or 'gradle test'.",
    }),
  ];
}

// ---- Build wrapper --------------------------------------------------------------------------------

function missingWrappers(ctx: ProjectContext): string[] {
  const missing: string[] = [];
  if (usesMaven(ctx) && !(hasRootFile(ctx, "mvnw") && hasRootFile(ctx, ".mvn/wrapper/maven-wrapper.properties"))) {
    missing.push("Maven (mvnw)");
  }
  if (
    usesGradle(ctx) &&
    !(hasRootFile(ctx, "gradlew") && hasRootFile(ctx, "gradle/wrapper/gradle-wrapper.properties"))
  ) {
    missing.push("Gradle (gradlew)");
  }
  return missing;
}

export function checkJavaWrapper(ctx: ProjectContext): Finding[] {
  const missing = missingWrappers(ctx);

  if (missing.length === 0) {
    return [
      make({
        ruleId: "java.wrapper",
        severity: "pass",
        title: "Build wrapper found",
        message: "The project ships its own Maven or Gradle wrapper",
      }),
    ];
  }

  const gradleOnly = missing.length === 1 && missing[0].startsWith("Gradle");
  return [
    make({
      ruleId: "java.wrapper",
      severity: "warning",
      title: `No build wrapper for ${missing.join(" and ")}`,
      message: "The wrapper script or its properties file is missing",
      why: "Without a wrapper, everyone must install the right Maven or Gradle version by hand, and builds differ from machine to machine.",
      suggestion: gradleOnly
        ? "Run 'gradle wrapper' once, then commit gradlew, gradlew.bat and the gradle/wrapper folder."
        : "Run 'mvn wrapper:wrapper' (Maven) or 'gradle wrapper' (Gradle) once, then commit the generated files.",
    }),
  ];
}

// ---- Dependency versions --------------------------------------------------------------------------

// Maven: <version>LATEST</version> or <version>RELEASE</version>
const MAVEN_FLOATING = /<version>\s*(LATEST|RELEASE)\s*<\/version>/g;
// Gradle: "group:artifact:+", "group:artifact:1.+" and "latest.release"
const GRADLE_FLOATING = /['"][\w.-]+:[\w.-]+:(?:[^'"\s:]*\+[^'"\s:]*|latest\.(?:release|integration))['"]/g;

export async function checkJavaDependencies(ctx: ProjectContext): Promise<Finding[]> {
  const pom = stripComments((await readRootFile(ctx, "pom.xml")) ?? "");
  const gradle = stripComments(await readAll(ctx, GRADLE_BUILD_FILES));

  const floating = [...(pom.match(MAVEN_FLOATING) ?? []), ...(gradle.match(GRADLE_FLOATING) ?? [])];
  const count = floating.length;

  if (count === 0) {
    return [
      make({
        ruleId: "java.dependencies-pinned",
        severity: "pass",
        title: "No floating dependency versions",
        message: "No LATEST, RELEASE or '+' versions found",
      }),
    ];
  }

  return [
    make({
      ruleId: "java.dependencies-pinned",
      severity: "warning",
      title: `${count} ${count === 1 ? "dependency uses" : "dependencies use"} a floating version`,
      message: "LATEST, RELEASE, '+' or latest.release versions in the build file",
      why: "A floating version means the same build can pull different code next month, and a new release can break your project overnight.",
      suggestion: "Replace each one with an exact version, for example 2.17.1. Gradle's 'dependencies' task and 'mvn versions:display-dependency-updates' show the current ones.",
    }),
  ];
}
