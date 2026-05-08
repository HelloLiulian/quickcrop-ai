export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        const formData = new FormData();
        const fileBuffer = await new Promise((resolve, reject) => {
            let chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks)));
            req.on('error', reject);
        });

        const boundary = req.headers['content-type'].split('boundary=')[1];
        const parts = parseMultipart(fileBuffer, boundary);

        const imagePart = parts.find(p => p.name === 'image');
        if (!imagePart) {
            return res.status(400).json({ error: '请上传图片' });
        }

        const hfFormData = new FormData();
        const blob = new Blob([imagePart.data], { type: imagePart.contentType });
        hfFormData.append('image', blob, 'image.jpg');

        const hfRes = await fetch(
            'https://api-inference.huggingface.co/models/nateraw/background-remover',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.HF_TOKEN}`
                },
                body: blob
            }
        );

        if (!hfRes.ok) {
            throw new Error(`Hugging Face API 错误: ${hfRes.status}`);
        }

        const resultBuffer = await hfRes.arrayBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.send(Buffer.from(resultBuffer));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

function parseMultipart(buffer, boundary) {
    const parts = [];
    const boundaryStr = `--${boundary}`;
    const endBoundary = `--${boundary}--`;
    const content = buffer.toString('binary');
    const sections = content.split(boundaryStr).filter(s => s.trim() && s !== '--' && !s.startsWith('--'));

    for (const section of sections) {
        const headerEnd = section.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const headers = section.substring(0, headerEnd);
        const body = section.substring(headerEnd + 4).replace(/\r\n$/, '');

        const nameMatch = headers.match(/name="([^"]+)"/);
        const filenameMatch = headers.match(/filename="([^"]+)"/);

        if (filenameMatch) {
            const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/);
            parts.push({
                name: nameMatch ? nameMatch[1] : 'unknown',
                filename: filenameMatch[1],
                contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
                data: Buffer.from(body, 'binary')
            });
        }
    }
    return parts;
}

export const config = {
    api: {
        bodyParser: false
    }
};
