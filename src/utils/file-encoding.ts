import * as fs from "fs/promises"
import * as jschardet from "jschardet"
import * as iconv from "iconv-lite"
import { fileExistsAtPath } from "./fs"

/**
 * Detects the encoding of a file.
 *
 * @param filePath - Path to the file
 * @returns The detected encoding or 'utf8' as fallback
 */
export async function detectFileEncoding(filePath: string): Promise<string> {
	try {
		// First check if file exists
		if (!(await fileExistsAtPath(filePath))) {
			throw new Error(`File does not exist: ${filePath}`)
		}

		// Read a sample of the file to detect encoding
		// Reading the first 4KB should be sufficient for most encoding detection
		const buffer = await fs.readFile(filePath, { encoding: null, flag: "r" })

		if (buffer.length === 0) {
			// Empty file, assume UTF-8
			return "utf8"
		}

		// Use jschardet to detect encoding
		// We're only using a portion of the file for faster detection
		const sampleSize = Math.min(buffer.length, 4096)
		const result = jschardet.detect(buffer.slice(0, sampleSize))

		// If confidence is low or encoding is null, default to UTF-8
		if (!result.encoding || result.confidence < 0.8) {
			return "utf8"
		}

		// Normalize encoding names
		const encoding = normalizeEncodingName(result.encoding)
		return encoding
	} catch (error) {
		console.error(`Error detecting encoding for ${filePath}:`, error)
		// Default to UTF-8 if detection fails
		return "utf8"
	}
}

/**
 * Normalizes encoding names to be compatible with iconv-lite.
 *
 * @param encoding - The encoding name from jschardet
 * @returns Normalized encoding name compatible with iconv-lite
 */
function normalizeEncodingName(encoding: string): string {
	// Convert to lowercase
	const lower = encoding.toLowerCase()

	// Map of jschardet encoding names to iconv-lite encoding names
	const encodingMap: Record<string, string> = {
		ascii: "ascii",
		"utf-8": "utf8",
		"utf-16le": "utf16le",
		"utf-16be": "utf16be",
		"iso-8859-1": "latin1",
		"iso-8859-2": "latin2",
		"iso-8859-3": "latin3",
		"iso-8859-4": "latin4",
		"iso-8859-5": "latin5",
		"iso-8859-6": "latin6",
		"iso-8859-7": "latin7",
		"iso-8859-8": "latin8",
		"iso-8859-9": "latin9",
		"iso-8859-10": "latin10",
		"windows-1250": "win1250",
		"windows-1251": "win1251",
		"windows-1252": "win1252",
		"windows-1253": "win1253",
		"windows-1254": "win1254",
		"windows-1255": "win1255",
		"windows-1256": "win1256",
		"windows-1257": "win1257",
		"windows-1258": "win1258",
		gbk: "gbk",
		gb2312: "gb2312",
		gb18030: "gb18030",
		big5: "big5",
		"euc-jp": "eucjp",
		shift_jis: "shiftjis",
		"euc-kr": "euckr",
		// Add more mappings as needed
	}

	return encodingMap[lower] || lower
}

/**
 * Reads a file with automatic encoding detection and converts content to UTF-8.
 *
 * @param filePath - Path to the file to read
 * @returns Promise resolving to the file content as UTF-8 string
 */
export async function readFileWithEncoding(filePath: string): Promise<string> {
	try {
		// First check if file exists
		if (!(await fileExistsAtPath(filePath))) {
			throw new Error(`File does not exist: ${filePath}`)
		}

		// Detect encoding
		const encoding = await detectFileEncoding(filePath)

		// If UTF-8, read directly
		if (encoding === "utf8") {
			return await fs.readFile(filePath, "utf8")
		}

		// For other encodings, use iconv-lite to convert
		const buffer = await fs.readFile(filePath, { encoding: null })
		if (!iconv.encodingExists(encoding)) {
			console.warn(`Unknown encoding: ${encoding}, falling back to utf8`)
			return buffer.toString("utf8")
		}

		return iconv.decode(buffer, encoding)
	} catch (error) {
		console.error(`Error reading file ${filePath}:`, error)
		throw error
	}
}
