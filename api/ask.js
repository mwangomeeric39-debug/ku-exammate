export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { unitCode, content, contentType, studentQuery } = req.body;

    if (!unitCode || !content || !studentQuery) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        let userMessageContent = [];

        // If the uploaded file is an image, use Grok Vision format
        if (contentType && contentType.startsWith('image/')) {
            userMessageContent = [
                {
                    type: "text",
                    text: `Here is an image of my study material for ${unitCode}. Based on this image, answer this question: ${studentQuery}`
                },
                {
                    type: "image_url",
                    image_url: {
                        url: content // Base64 image data string
                    }
                }
            ];
        } else {
            // For PDFs, Spreadsheets, or text copy-paste
            userMessageContent = `Here are my lecture notes/material (${contentType || 'Text'}):\n${content}\n\nBased on these materials, answer this question: ${studentQuery}`;
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
                    {
                        role: "system",
                        content: `You are an expert AI study coach for Kenyatta University (KU) students. You help students master their course units (like ${unitCode}) using their notes, images, tables, and documents. Be encouraging, clear, and practical.`
                    },
                    {
                        role: "user",
                        content: userMessageContent
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