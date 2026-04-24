import type { OpenClawPluginApi } from "openclaw/plugin-sdk/data-extractor";
import type { DataExtractorConfig } from "../config.js";

// Re-export config type
export type { DataExtractorConfig };

export interface ExtractionResult {
  extracted_data: any;
  confidence_scores: Record<string, number>;
  extraction_notes: string;
  warnings: string[];
}

export interface DataEntry {
  id: string;
  data: any;
  metadata: {
    confidence: Record<string, number>;
    notes: string;
    warnings: string[];
    timestamp: number;
    source: string;
    channel: string;
    tableName: string;
  };
  created_at: number;
}

export interface ExtractionParams {
  text: string;
  schema: any;
  tableName: string;
  extractionRules?: string;
  confidence?: number;
  provider?: string;
  model?: string;
  authProfileId?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export type ExtractionContext = {
  api: OpenClawPluginApi;
  senderId: string;
  channel: string;
  config: DataExtractorConfig;
};

export const CONTACT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "姓名" },
    email: { type: ["string", "null"], format: "email", description: "邮箱地址" },
    phone: { type: ["string", "null"], description: "电话号码" },
    company: { type: ["string", "null"], description: "公司名称" },
    role: { type: ["string", "null"], description: "职位角色" },
    address: { type: ["string", "null"], description: "地址" },
    wechat: { type: ["string", "null"], description: "微信号" },
    qq: { type: ["string", "null"], description: "QQ号" },
  },
  required: ["name"],
};

export const PRODUCT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "产品名称" },
    price: { type: ["number", "null"], description: "价格" },
    category: { type: ["string", "null"], description: "产品分类" },
    brand: { type: ["string", "null"], description: "品牌" },
    model: { type: ["string", "null"], description: "型号规格" },
    description: { type: ["string", "null"], description: "产品描述" },
  },
  required: ["name"],
};

export const ADDRESS_SCHEMA = {
  type: "object",
  properties: {
    full_address: { type: "string", description: "完整地址" },
    province: { type: ["string", "null"], description: "省份" },
    city: { type: ["string", "null"], description: "城市" },
    district: { type: ["string", "null"], description: "区县" },
    street: { type: ["string", "null"], description: "街道地址" },
    postal_code: { type: ["string", "null"], description: "邮政编码" },
  },
  required: ["full_address"],
};
