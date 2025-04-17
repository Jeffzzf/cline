import * as path from "path"
// @ts-ignore-next-line
import pdf from "pdf-parse/lib/pdf-parse"
import mammoth from "mammoth"
import fs from "fs/promises"
import { isBinaryFile } from "isbinaryfile"
import { getFileSizeInKB } from "../../utils/fs"
import { readFileWithEncoding } from "../../utils/file-encoding"

export async function extractTextFromFile(filePath: string): Promise<string> {
	try {
		await fs.access(filePath)
	} catch (error) {
		throw new Error(`File not found: ${filePath}`)
	}
	const fileExtension = path.extname(filePath).toLowerCase()
	switch (fileExtension) {
		case ".pdf":
			return extractTextFromPDF(filePath)
		case ".docx":
			return extractTextFromDOCX(filePath)
		case ".ipynb":
			return extractTextFromIPYNB(filePath)
		default:
			const isBinary = await isBinaryFile(filePath).catch(() => false)
			if (!isBinary) {
				// If file is over 300KB, throw an error
				const fileSizeInKB = await getFileSizeInKB(filePath)
				if (fileSizeInKB > 300) {
					throw new Error(`File is too large to read into context.`)
				}
				// Use our encoding-aware file reader
				return await readFileWithEncoding(filePath)
			} else {
				throw new Error(`Cannot read text for file type: ${fileExtension}`)
			}
	}
}

async function extractTextFromPDF(filePath: string): Promise<string> {
	try {
		const dataBuffer = await fs.readFile(filePath)
		const data = await pdf(dataBuffer)
		return data.text
	} catch (error) {
		console.error("Error extracting text from PDF:", error)
		throw new Error("Failed to extract text from PDF file")
	}
}

async function extractTextFromDOCX(filePath: string): Promise<string> {
	try {
		const buffer = await fs.readFile(filePath)
		const result = await mammoth.extractRawText({ buffer })
		return result.value
	} catch (error) {
		console.error("Error extracting text from DOCX:", error)
		throw new Error("Failed to extract text from DOCX file")
	}
}

async function extractTextFromIPYNB(filePath: string): Promise<string> {
	try {
		// Read the notebook file
		const content = await readFileWithEncoding(filePath)
		const notebook = JSON.parse(content)

		// Process cells to extract text content
		let extractedText = ""

		if (Array.isArray(notebook.cells)) {
			for (const cell of notebook.cells) {
				// Only include markdown and code cells
				if (cell.cell_type === "markdown" || cell.cell_type === "code") {
					// Get source content from cell, which can be string or array of strings
					const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""

					if (source.trim()) {
						extractedText += `--- ${cell.cell_type.toUpperCase()} CELL ---\n`
						extractedText += source
						extractedText += "\n\n"
					}

					// For code cells, include outputs if they exist
					if (cell.cell_type === "code" && Array.isArray(cell.outputs)) {
						for (const output of cell.outputs) {
							if (output.output_type === "stream" && output.text) {
								const text = Array.isArray(output.text) ? output.text.join("") : output.text
								if (text.trim()) {
									extractedText += "OUTPUT:\n"
									extractedText += text
									extractedText += "\n"
								}
							} else if (output.output_type === "execute_result" && output.data && output.data["text/plain"]) {
								const text = Array.isArray(output.data["text/plain"])
									? output.data["text/plain"].join("")
									: output.data["text/plain"]
								if (text.trim()) {
									extractedText += "RESULT:\n"
									extractedText += text
									extractedText += "\n"
								}
							}
						}
					}
				}
			}
		}

		return extractedText.trim()
	} catch (error) {
		console.error("Error extracting text from Jupyter notebook:", error)
		throw new Error("Failed to extract text from Jupyter notebook file")
	}
}
