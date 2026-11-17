export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { unitCode, content, contentType, studentQuery, actionType, studentAnswers } = req.body;

    if (!unitCode || !content) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        let systemPrompt = `You are an expert AI adaptive study coach for Kenyatta University (KU) students studying ${unitCode}.`;
        let userMessage = "";

        if (actionType === "diagnose_exam") {
            systemPrompt += ` You are performing an adaptive diagnostic analysis on a student's exam answers against their uploaded study materials. Identify the exact weak topics (e.g. database normalization, recursion, etc.), explain them simply, generate targeted practice questions for the weak areas, and set up a re-test.`;
            userMessage = `Here are my study materials:\n${content}\n\nHere are my answers to the diagnostic exam:\n${studentAnswers}\n\nAnalyze my performance. Identify what topic I am struggling with most, explain it simply, provide 2 targeted practice questions on that specific weak topic, and explain how we can measure my improvement.`;
        } else if (contentType && contentType.startsWith('image/')) {
            userMessage = [
                { type: "text", text: `Based on this image for ${unitCode}, answer: ${studentQuery}` },
                { type: "image_url", image_url: { url: content } }
            ];
        } else {
            userMessage = `Here are my course notes/materials for ${unitCode}:\n${content}\n\nBased on these materials, ${studentQuery}`;
        }

        const response = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.XAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "grok-beta",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        
        if (!data.choices || data.choices.length === 0) {
            throw new Error('Invalid response from Grok API');
        }

        return res.status(200).json({ reply: data.choices[0].message.content });
    } catch (error) {
        console.error("Grok API Error:", error);
        return res.status(500).json({ error: 'Failed to connect to Grok AI.' });
    }
}