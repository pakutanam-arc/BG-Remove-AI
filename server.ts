import express from 'express';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini client
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // API 1: Generate Background (Text-to-Image)
  app.post('/api/generate-background', async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: {
          parts: [
            { text: `A realistic high-quality background: ${prompt}. Empty space in the center, no foreground subjects.` },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: '1:1',
            imageSize: '1K',
          },
        },
      });

      let imageBase64 = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!imageBase64) {
        throw new Error('No image generated');
      }

      res.json({ image: imageBase64 });
    } catch (error: any) {
      console.error('Error generating background:', error);
      res.status(500).json({ error: error.message || 'Failed to generate background' });
    }
  });

  // API 2: Enhance Image
  app.post('/api/enhance', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Image is required' });
      }

      // Convert image to JPEG if it's not (for best compatibility) and resize if too large
      const processedImage = await sharp(req.file.buffer)
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();

      const base64ImageData = processedImage.toString('base64');
      const mimeType = 'image/jpeg';

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64ImageData,
                mimeType: mimeType,
              },
            },
            {
              text: 'Enhance this image. Improve the lighting, sharpness, and color balance to make it look professional and high quality.',
            },
          ],
        },
      });

      let enhancedImageBase64 = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          enhancedImageBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!enhancedImageBase64) {
        throw new Error('No image generated');
      }

      res.json({ image: enhancedImageBase64 });
    } catch (error: any) {
      console.error('Error enhancing image:', error);
      res.status(500).json({ error: error.message || 'Failed to enhance image' });
    }
  });

  // API 3: Remove Object
  app.post('/api/remove-object', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Image is required' });
      }
      const { prompt, maskData } = req.body;
      if (!prompt && !maskData) {
        return res.status(400).json({ error: 'Prompt or mask is required' });
      }

      const processedImage = await sharp(req.file.buffer)
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();

      const base64ImageData = processedImage.toString('base64');
      const mimeType = 'image/jpeg';

      const parts: any[] = [
        {
          inlineData: {
            data: base64ImageData,
            mimeType: mimeType,
          },
        },
      ];

      if (maskData) {
        const maskBase64 = maskData.split(',')[1] || maskData;
        parts.push({
          inlineData: {
            data: maskBase64,
            mimeType: 'image/png',
          },
        });
        parts.push({
          text: prompt 
            ? `Use the second image as a mask. Remove the object highlighted in white in the mask and described as: "${prompt}". Fill in the background realistically.`
            : `Use the second image as a mask. Remove the object highlighted in white in the mask. Fill in the background realistically.`,
        });
      } else {
        parts.push({
          text: `Remove the following object from the image: "${prompt}". Fill in the background realistically as if the object was never there. Keep the rest of the image exactly the same.`,
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: {
          parts: parts,
        },
      });

      let resultImageBase64 = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          resultImageBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!resultImageBase64) {
        throw new Error('No image generated');
      }

      res.json({ image: resultImageBase64 });
    } catch (error: any) {
      console.error('Error removing object:', error);
      res.status(500).json({ error: error.message || 'Failed to remove object' });
    }
  });

  // API 4: Upscale Image
  app.post('/api/upscale', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Image is required' });
      }

      const processedImage = await sharp(req.file.buffer)
        .jpeg({ quality: 100 })
        .toBuffer();

      const base64ImageData = processedImage.toString('base64');
      const mimeType = 'image/jpeg';

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64ImageData,
                mimeType: mimeType,
              },
            },
            {
              text: 'Upscale this image to higher resolution, make it sharper and more detailed without changing the content.',
            },
          ],
        },
        config: {
          imageConfig: {
            imageSize: '2K', // Request a larger output for upscale
          },
        },
      });

      let upscaledImageBase64 = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          upscaledImageBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!upscaledImageBase64) {
        throw new Error('No image generated');
      }

      res.json({ image: upscaledImageBase64 });
    } catch (error: any) {
      console.error('Error upscaling image:', error);
      res.status(500).json({ error: error.message || 'Failed to upscale image' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
