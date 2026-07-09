import { z } from "zod";

export const FieldTypeSchema = z.enum(["dropdown", "radio", "text", "info_block"]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const AddOnTypeSchema = z.enum(["none", "price", "product"]);
export type AddOnType = z.infer<typeof AddOnTypeSchema>;

export const ConfiguratorOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  isDefault: z.boolean().default(false),
  addOnType: AddOnTypeSchema.default("none"),
  priceDelta: z.number().int().positive().optional(),
  addOnProductId: z.string().optional(),
});
export type ConfiguratorOption = z.infer<typeof ConfiguratorOptionSchema>;

export const VisibilityOperatorSchema = z.enum(["equals", "not_equals"]);
export type VisibilityOperator = z.infer<typeof VisibilityOperatorSchema>;

export const VisibilityConditionSchema = z.object({
  fieldId: z.string().min(1),
  operator: VisibilityOperatorSchema,
  value: z.string().min(1),
});
export type VisibilityCondition = z.infer<typeof VisibilityConditionSchema>;

export const ConfiguratorFieldSchema = z.object({
  id: z.string().min(1),
  type: FieldTypeSchema,
  label: z.string().min(1),
  required: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
  options: z.array(ConfiguratorOptionSchema).optional(),
  conditions: z.array(VisibilityConditionSchema).optional(),
  defaultValue: z.string().optional(),
  placeholder: z.string().optional(),
  content: z.string().optional(),
});
export type ConfiguratorField = z.infer<typeof ConfiguratorFieldSchema>;

export const OptionInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  type: FieldTypeSchema,
  label: z.string().min(1, "Label is required"),
  required: z.boolean().default(false),
  options: z.array(ConfiguratorOptionSchema).optional(),
  placeholder: z.string().optional(),
  content: z.string().optional(),
});
export type OptionInput = z.infer<typeof OptionInputSchema>;

export const OptionSetInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  status: z.boolean().default(true),
  rank: z.number().int().default(0),
  assignmentType: z.enum(["manual", "automatic"]).default("manual"),
  autoCollections: z.array(z.string()).optional(),
  autoTags: z.string().optional(),
  autoVendor: z.string().optional(),
  fields: z.array(ConfiguratorFieldSchema).default([]),
  assignments: z.array(z.string()).optional(),
});
export type OptionSetInput = z.infer<typeof OptionSetInputSchema>;