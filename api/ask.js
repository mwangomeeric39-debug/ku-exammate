
export default async function handler(req, res) {
    // 1. Allow POST requests only
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    // 2. Check API key
    const apiKey = process.env.XAI_API_KEY;

    if (!apiKey) {
        console.error("XAI_API_KEY is missing.");

        return res.status(500).json({
            error: "AI service is not configured."
        });
    }

    // 3. Read request data
    const {
        unitCode,
        content,
        contentType = "text/plain",
        studentQuery = "",
        actionType = "",
        studentAnswers = ""
    } = req.body || {};

    // 4. Validate required fields
    if (
        typeof unitCode !== "string" ||
        !unitCode.trim() ||
        typeof content !== "string" ||
        !content.trim()
    ) {
        return res.status(400).json({
            error: "Missing course unit or study content."
        });
    }

    if (
        typeof contentType !== "string" ||
        typeof studentQuery !== "string" ||
        typeof actionType !== "string" ||
        typeof studentAnswers !== "string"
    ) {
        return res.status(400).json({
            error: "Invalid request format."
        });
    }

    const isImage = contentType.startsWith("image/");

    // 5. Validate content size
    if (!isImage && content.length > 120000) {
        return res.status(413).json({
            error: "Study text is too large. Please upload fewer pages."
        });
    }

    if (isImage && content.length > 12 * 1024 * 1024) {
        return res.status(413).json({
            error: "Image is too large. Please upload a smaller image."
        });
    }

    // 6. System instructions
    const systemPrompt = `
You are ExamMate, an expert AI study coach.

You help university students understand their course materials.

Course unit: ${unitCode}

Your responsibilities:
- Explain difficult ideas in simple language.
- Use supplied study material as your primary source.
- Organise answers using headings and bullet points.
- Preserve important definitions, formulas and examples.
- Never invent information and present it as if it came from the notes.
- If the supplied material does not contain the answer, say so.
- Help students understand concepts rather than simply memorising answers.
`;

    // 7. Prepare the user message
    let userMessage = "";

    if (actionType === "summarize_chunk") {

        userMessage = `
Summarise this section of lecture notes for ${unitCode}.

Instructions:
1. Identify the main topics.
2. Explain important concepts clearly.
3. Preserve important definitions and formulas.
4. Include useful examples where present.
5. Use concise bullet points.
6. Do not invent facts.
7. Avoid unnecessary introductions.

LECTURE NOTES SECTION:

${content}

${studentQuery}
`;

    } else if (actionType === "combine_summary") {

        userMessage = `
Combine the following section summaries into one complete revision guide for ${unitCode}.

Instructions:
1. Organise material under clear topic headings.
2. Remove repeated information.
3. Preserve important definitions and explanations.
4. Include formulas and examples where supplied.
5. Use clear, student-friendly language.
6. Do not add unsupported information.
7. Make the final result useful for exam revision.

SECTION SUMMARIES:

${content}
`;

    } else if (actionType === "diagnose_exam") {

        userMessage = `
Analyse this student's diagnostic answers for ${unitCode}.

STUDY MATERIALS:
${content}

STUDENT ANSWERS:
${studentAnswers}

Provide:

1. What the student understood correctly.
2. What the student misunderstood or missed.
3. The weakest topic or concept, if supported by the answers.
4. A simple explanation of that weak topic.
5. Two targeted practice questions.
6. How improvement can be measured in a retest.

Base your analysis on the supplied materials.
Do not assume weakness without evidence.
`;

    } else if (isImage) {

        userMessage = [
            {
                type: "text",
                text: `
You are helping a student studying ${unitCode}.

Read the uploaded study image carefully.

${studentQuery || "Explain the content of this image and summarise its important points."}
`
            },
            {
                type: "image_url",
                image_url: {
                    url: content
                }
            }
        ];

    } else {

        userMessage = `
Here are my lecture notes for ${unitCode}:

${content}

STUDENT REQUEST:

${studentQuery || "Explain the important concepts in these notes."}
`;
    }

    // 8. Send request to xAI
    try {
        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 60000);

        let response;

        try {
            response = await fetch(
                "https://api.x.ai/v1/chat/completions",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },

                    body: JSON.stringify({
                        model: "grok-4.7",

                        messages: [
                            {
                                role: "system",
                                content: systemPrompt
                            },
                            {
                                role: "user",
                                content: userMessage
                            }
                        ],

                        temperature: 0.3,

                        max_tokens:
                            actionType === "combine_summary"
                                ? 2500
                                : 1500
                    }),

                    signal: controller.signal
                }
            );

        } finally {
            clearTimeout(timeout);
        }

        // 9. Read provider response safely
        const rawResponse = await response.text();

        let data;

        try {
            data = JSON.parse(rawResponse);
        } catch {
            data = {
                error: {
                    message: rawResponse || "Empty response from AI provider."
                }
            };
        }

        // 10. Handle xAI errors
        if (!response.ok) {
            const providerMessage =
                data?.error?.message ||
                data?.error?.code ||
                "Unknown xAI provider error.";

            console.error("xAI API ERROR:", {
                status: response.status,
                details: data
            });

            return res.status(502).json({
                error: "xAI request failed.",
                details: providerMessage,
                providerStatus: response.status
            });
        }

        // 11. Check AI response
        const reply = data?.choices?.[0]?.message?.content;

        if (!reply || typeof reply !== "string") {
            console.error("Unexpected xAI response:", data);

            return res.status(502).json({
                error: "The AI returned an empty or invalid response.",
                details: "No text was found in the provider response."
            });
        }

        // 12. Return successful answer
        return res.status(200).json({
            reply: reply.trim()
        });

    } catch (error) {

        console.error("ExamMate AI Error:", error);

        if (error.name === "AbortError") {
            return res.status(504).json({
                error: "The AI request took too long. Please try again."
            });
        }

        return res.status(500).json({
            error: "Failed to connect to the AI service.",
            details: error.message
        });
    }
}
