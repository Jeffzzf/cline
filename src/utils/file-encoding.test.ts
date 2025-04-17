import * as fs from "fs/promises"
import { after, before, describe, it } from "mocha"
import * as os from "os"
import * as path from "path"
import "should"
import { spawn } from "child_process"
import { detectFileEncoding, readFileWithEncoding } from "./file-encoding"

describe("File Encoding Utilities", () => {
	const tmpDir = path.join(os.tmpdir(), "cline-encoding-test-" + Math.random().toString(36).slice(2))

	// Create test directory
	before(async () => {
		await fs.mkdir(tmpDir, { recursive: true })
	})

	// Clean up after tests
	after(async () => {
		try {
			await fs.rm(tmpDir, { recursive: true, force: true })
		} catch {
			// Ignore cleanup errors
		}
	})

	// Helper to create a file with specific encoding using echo and iconv
	async function createFileWithEncoding(filePath: string, content: string, encoding: string): Promise<void> {
		return new Promise((resolve, reject) => {
			// Use echo and iconv to create a file with specific encoding
			const process = spawn("bash", ["-c", `echo -n "${content}" | iconv -f UTF-8 -t ${encoding} > "${filePath}"`])

			process.on("close", (code) => {
				if (code === 0) {
					resolve()
				} else {
					reject(new Error(`Failed to create file with encoding ${encoding}`))
				}
			})

			process.on("error", reject)
		})
	}

	describe("detectFileEncoding", () => {
		it("should detect UTF-8 encoding", async () => {
			const testFile = path.join(tmpDir, "utf8.txt")
			await fs.writeFile(testFile, "Hello, world! UTF-8 encoded text.")

			const encoding = await detectFileEncoding(testFile)
			encoding.should.equal("utf8")
		})

		it("should detect UTF-16LE encoding", async () => {
			const testFile = path.join(tmpDir, "utf16le.txt")
			await createFileWithEncoding(testFile, "Hello, world! UTF-16LE encoded text.", "UTF-16LE")

			const encoding = await detectFileEncoding(testFile)
			// jschardet may detect this as either utf-16le or utf-16be
			encoding.toLowerCase().should.startWith("utf16")
		})

		it("should handle empty files", async () => {
			const testFile = path.join(tmpDir, "empty.txt")
			await fs.writeFile(testFile, "")

			const encoding = await detectFileEncoding(testFile)
			encoding.should.equal("utf8")
		})

		it("should default to UTF-8 for non-existent files", async () => {
			const nonExistentFile = path.join(tmpDir, "nonexistent.txt")

			try {
				await detectFileEncoding(nonExistentFile)
				// Should not reach here
				false.should.be.true()
			} catch (error) {
				;(error as Error).message.should.match(/File does not exist/)
			}
		})
	})

	describe("readFileWithEncoding", () => {
		it("should read UTF-8 files correctly", async () => {
			const testFile = path.join(tmpDir, "utf8-content.txt")
			const content = "Hello, world! UTF-8 encoded text."
			await fs.writeFile(testFile, content, "utf8")

			const result = await readFileWithEncoding(testFile)
			result.should.equal(content)
		})

		it("should convert non-UTF-8 files to UTF-8", async () => {
			const testFile = path.join(tmpDir, "gbk-content.txt")
			const content = "你好，世界！GBK encoded text."
			await createFileWithEncoding(testFile, content, "GBK")

			const result = await readFileWithEncoding(testFile)
			result.should.equal(content)
		})

		it("should throw for non-existent files", async () => {
			const nonExistentFile = path.join(tmpDir, "nonexistent-read.txt")

			try {
				await readFileWithEncoding(nonExistentFile)
				// Should not reach here
				false.should.be.true()
			} catch (error) {
				;(error as Error).message.should.match(/File does not exist/)
			}
		})
	})
})
