
export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    if (!process.env.XAI_API_KEY) {
        console.error("XAI_API_KEY is missing.");

        return res.status(500).json({
            error: "AI service is not configured."
        });
    }

    const {
        unitCode,
        content,
        contentType = "text/plain",
        studentQuery = "",
        actionType = "",
        studentAnswers = ""
    } = req.body || {};

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

    const isImage = contentType.startsWith("image/");

    // Keep normal text requests within a reasonable size.
    // Images have a separate limit because they are sent as data URLs.
    if (!isImage && content.length > 120000) {
        return res.status(413).json({
            error: "This text is too large. Please upload fewer pages or use the summary feature."
        });
    }

    if (isImage && content.length > 12 * 1024 * 1024) {
        return res.status(413).json({
            error: "This image is too large. Please upload a smaller image."
        });
    }

    const systemPrompt = `
You are ExamMate, an expert AI study coach.

You help university students understand their course materials.

Course unit: ${unitCode}

Your responsibilities:
- Explain difficult ideas in simple language.
- Use the supplied study material as your primary source.
- Organise answers using headings and bullet points.
- Preserve important definitions, formulas and examples.
- Never invent information and present it as if it came from the notes.
- If the supplied material does not contain the answer, say so.
- Help students understand concepts rather than simply memorising answers.
`;

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
    }

    else if (actionType === "combine_summary") {
        userMessage = `
Combine the following section summaries into one complete revision guide for ${unitCode}.

Instructions:
1. Organise the material under clear topic headings.
2. Remove repeated information.
3. Preserve important definitions and explanations.
4. Include formulas and examples where supplied.
5. Use clear, student-friendly language.
6. Do not add unsupported information.
7. Make the final result useful for exam revision.

SECTION SUMMARIES:

${content}
`;
    }

    else if (actionType === "diagnose_exam") {
        userMessage = `
You are analysing a student's diagnostic answer for ${unitCode}.

STUDY MATERIALS:
${content}

STUDENT ANSWER:
${studentAnswers}

Analyse the answer and provide:

1. What the student understood correctly.
2. What the student misunderstood or missed.
3. The weakest topic or concept.
4. A simple explanation of that weak topic.
5. Two targeted practice questions.
6. How the student can measure improvement in a retest.

Base your analysis on the supplied study materials.
Do not assume that the student is weak in a topic without evidence.
`;
    }

    else if (isImage) {
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
    }

    else {
        userMessage = `
Here are my lecture notes for ${unitCode}:

${content}

STUDENT REQUEST:

${studentQuery || "Explain the important concepts in these notes."}
`;
    }

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
                        "Authorization": `Bearer ${process.env.XAI_API_KEY}`
                    },

                    body: JSON.stringify({
                        model: "grok-beta",

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
                        max_tokens: actionType === "combine_summary" ? 2500 : 1500
                    }),

                    signal: controller.signal
                }
            );

        } finally {
            clearTimeout(timeout);
        }

        const data = await response.json();

        if (!response.ok) {
            console.error("xAI API response:", data);

            return res.status(502).json({
                error:
                    data?.error?.message ||
                    "The AI provider could not process your request."
            });
        }

        const reply = data?.choices?.[0]?.message?.content;

        if (!reply || typeof reply !== "string") {
            console.error("Unexpected xAI response:", data);

            return res.status(502).json({
                error: "The AI returned an empty or invalid response."
            });
        }

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
            error: "Failed to connect to the AI service."
        });
    }
}
