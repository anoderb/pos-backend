import dotenv from 'dotenv';
dotenv.config();

export const hfConfig = {
  token: process.env.HF_TOKEN,
  repo: process.env.HF_REPO || 'Anoderb/dataset-collect',
  baseUrl: `https://huggingface.co/api/datasets/${process.env.HF_REPO || 'Anoderb/dataset-collect'}`,
  resolveBaseUrl: `https://huggingface.co/datasets/${process.env.HF_REPO || 'Anoderb/dataset-collect'}/resolve/main`,
};
