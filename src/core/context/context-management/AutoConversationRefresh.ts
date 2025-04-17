import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler } from "../../../api"
import { ClineApiReqInfo, ClineMessage } from "../../../shared/ExtensionMessage"
import { getContextWindowInfo } from "./context-window-utils"

/**
 * Class to manage automatic conversation refresh when token count approaches context limit
 */
export class AutoConversationRefresh {
	private refreshCount: number = 0
	private maxRefreshCount: number = 10
	private tokenThresholdPercentage: number = 0.7

	constructor(maxRefreshCount: number = 10, tokenThresholdPercentage: number = 0.7) {
		this.maxRefreshCount = maxRefreshCount
		this.tokenThresholdPercentage = tokenThresholdPercentage
	}

	/**
	 * Reset refresh count to zero
	 */
	public reset(): void {
		this.refreshCount = 0
	}

	/**
	 * Check if automatic refresh is needed based on token count
	 * @param clineMessages Messages in the current conversation
	 * @param previousApiReqIndex Index of the previous API request
	 * @param api API handler
	 * @returns true if refresh is needed, false otherwise
	 */
	public shouldRefreshConversation(clineMessages: ClineMessage[], previousApiReqIndex: number, api: ApiHandler): boolean {
		// Don't refresh if we've already hit the max count
		if (this.refreshCount >= this.maxRefreshCount) {
			return false
		}

		// Check token usage in previous request
		if (previousApiReqIndex >= 0) {
			const previousRequest = clineMessages[previousApiReqIndex]
			if (previousRequest && previousRequest.text) {
				try {
					const { tokensIn, tokensOut, cacheWrites, cacheReads }: ClineApiReqInfo = JSON.parse(previousRequest.text)
					const totalTokens = (tokensIn || 0) + (tokensOut || 0) + (cacheWrites || 0) + (cacheReads || 0)
					const { contextWindow } = getContextWindowInfo(api)

					// Check if token count exceeds threshold (default 70%)
					if (totalTokens >= contextWindow * this.tokenThresholdPercentage) {
						this.refreshCount++
						return true
					}
				} catch (error) {
					console.error("Error parsing previous request token info:", error)
				}
			}
		}

		return false
	}

	/**
	 * Create a summary of the current conversation
	 * @param apiConversationHistory Current conversation history
	 * @returns A summarized prompt for the new conversation
	 */
	public createConversationSummary(apiConversationHistory: Anthropic.MessageParam[]): string {
		// Extract task description from first user message if available
		let taskDescription = "the task"
		if (apiConversationHistory.length > 0 && apiConversationHistory[0].role === "user") {
			const firstUserContent = apiConversationHistory[0].content
			if (typeof firstUserContent === "string") {
				taskDescription = firstUserContent.substring(0, 200) + (firstUserContent.length > 200 ? "..." : "")
			} else if (Array.isArray(firstUserContent)) {
				const textBlocks = firstUserContent.filter((block) => block.type === "text")
				if (textBlocks.length > 0 && textBlocks[0].text) {
					taskDescription = textBlocks[0].text.substring(0, 200) + (textBlocks[0].text.length > 200 ? "..." : "")
				}
			}
		}

		// Find key information from conversation
		const actionItems = this.extractActionItems(apiConversationHistory)
		const completedItems = this.extractCompletedItems(apiConversationHistory)

		// Create a summary prompt
		return `[CONVERSATION CONTINUATION] 
This is a continuation of our previous conversation about ${taskDescription}. 
The context limit was reached, so I'm starting a new conversation to continue.

Progress so far:
${completedItems.map((item) => `- ${item}`).join("\n")}

To continue work on:
${actionItems.map((item) => `- ${item}`).join("\n")}

Please continue where we left off.`
	}

	/**
	 * Extract action items that are still pending
	 * @param apiConversationHistory Current conversation history
	 * @returns Array of action items
	 */
	private extractActionItems(apiConversationHistory: Anthropic.MessageParam[]): string[] {
		// Start from the most recent assistant messages and look for uncompleted tasks
		const actionItems: string[] = []

		// Process the last few messages (up to 3) to find uncompleted tasks
		const recentMessages = apiConversationHistory.slice(-6).filter((msg) => msg.role === "assistant")

		for (const message of recentMessages) {
			if (typeof message.content === "string") {
				// Extract tasks and todo items from the message
				const lines = message.content.split("\n")
				for (const line of lines) {
					const trimmedLine = line.trim()
					if (
						trimmedLine.startsWith("- [ ]") ||
						trimmedLine.startsWith("* ") ||
						trimmedLine.includes("TODO:") ||
						trimmedLine.includes("Next steps:") ||
						trimmedLine.includes("we need to")
					) {
						actionItems.push(trimmedLine)
					}
				}
			} else if (Array.isArray(message.content)) {
				// Process text blocks in the content array
				for (const block of message.content) {
					if (block.type === "text") {
						const lines = block.text.split("\n")
						for (const line of lines) {
							const trimmedLine = line.trim()
							if (
								trimmedLine.startsWith("- [ ]") ||
								trimmedLine.startsWith("* ") ||
								trimmedLine.includes("TODO:") ||
								trimmedLine.includes("Next steps:") ||
								trimmedLine.includes("we need to")
							) {
								actionItems.push(trimmedLine)
							}
						}
					}
				}
			}
		}

		// Limit the number of action items to avoid making the summary too long
		return actionItems.slice(0, 5)
	}

	/**
	 * Extract completed items from the conversation
	 * @param apiConversationHistory Current conversation history
	 * @returns Array of completed items
	 */
	private extractCompletedItems(apiConversationHistory: Anthropic.MessageParam[]): string[] {
		const completedItems: string[] = []

		// Process the last few messages to find completed tasks
		const recentMessages = apiConversationHistory.slice(-6).filter((msg) => msg.role === "assistant")

		for (const message of recentMessages) {
			if (typeof message.content === "string") {
				const lines = message.content.split("\n")
				for (const line of lines) {
					const trimmedLine = line.trim()
					if (
						trimmedLine.startsWith("- [x]") ||
						trimmedLine.includes("Completed:") ||
						trimmedLine.includes("I've successfully")
					) {
						completedItems.push(trimmedLine)
					}
				}
			} else if (Array.isArray(message.content)) {
				for (const block of message.content) {
					if (block.type === "text") {
						const lines = block.text.split("\n")
						for (const line of lines) {
							const trimmedLine = line.trim()
							if (
								trimmedLine.startsWith("- [x]") ||
								trimmedLine.includes("Completed:") ||
								trimmedLine.includes("I've successfully")
							) {
								completedItems.push(trimmedLine)
							}
						}
					}
				}
			}
		}

		// Limit the number of completed items
		return completedItems.slice(0, 5)
	}

	/**
	 * Get current refresh count
	 */
	public getRefreshCount(): number {
		return this.refreshCount
	}
}
