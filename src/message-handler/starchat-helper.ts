async function query(data: any, token: string): Promise<any> {
	const response = await fetch(
		"https://api-inference.huggingface.co/models/HuggingFaceH4/starchat-beta",
		{
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': "application/json" },
			method: "POST",
			body: JSON.stringify(data),
		}
	);
	// console.log("resposne: ", response)
	// console.log("response.body: ", response.body)
	const result = await response.blob();
	return result;
}

export async function getAnswer(queryInput: string, token: string): Promise<string> {
	const modQuery = queryInput + "<|end|>\n<|assistant|>\n"

	const res = await query({"inputs": modQuery}, token)
	// console.log("res: ", res)

	const text = await res.text()
	// console.log("text: ", text)
	let generatedText: string = JSON.parse(await res.text())[0].generated_text
	let iterations = 0

	let answer = generatedText.substring(modQuery.length)

	while (!answer.includes('<|end|>') && iterations < 100) {
		const r = await query({"inputs": modQuery + answer }, token)
		const generatedText2 = JSON.parse(await r.text())[0].generated_text
		answer = generatedText2.substring(modQuery.length)
		iterations++
	}

	const end = answer.indexOf('<|end|>')
	let finalAnswer = answer
	if (end > 0) {
		finalAnswer = answer.substring(0, end)
	}
	// console.log("finalAnswer: ", finalAnswer)
	return finalAnswer
}

// console.log(await getAnswer("Give me 5 use cases for the Veramo DID framework."))