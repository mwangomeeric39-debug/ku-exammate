export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { unitCode, notes, studentQuery } = req.body;

    if (!unitCode || !notes || !studentQuery) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const response = await fetch("https://api.x.ai/v1/chat/completions", {
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
                        content: `You are an expert AI study coach for Kenyatta University (KU) students. You help students master their course units (like ${unitCode}) using their lecture notes. Be encouraging, clear, and practical.`
                    },
                    {
                        role: "user",
                        content: `Here are my lecture notes/material:\n${notes}\n\nBased on these notes, answer this question: ${studentQuery}`
                    }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        
        if (!data.choices || data.choices.length === 0) {
            throw new Error('Invalid response from Grok API');
        }

        const aiReply = data.choices[0].message.content;

        return res.status(200).json({ reply: aiReply });
    } catch (error) {
        console.error("Grok API Error:", error);
        return res.status(500).json({ error: 'Failed to connect to Grok AI.' });
    }
}