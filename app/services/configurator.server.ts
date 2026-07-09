import prisma from "app/db.server";
import type { OptionInput, OptionSetInput } from "app/types/configurator";

interface ShopifyAdmin {
  graphql: (query: string, variables?: Record<string, unknown>) => Promise<Response>;
}

export async function getOptionSets() {
  return prisma.optionSet.findMany({
    include: {
      _count: { select: { assignments: true } },
    },
    orderBy: { rank: "asc" },
  });
}

export async function getOptionSet(id: string) {
  return prisma.optionSet.findUnique({
    where: { id },
    include: { assignments: true },
  });
}

export async function saveOptionSet(data: OptionSetInput) {
  const { id, assignments, autoCollections, fields, ...fieldsData } = data;

  const fieldsJson = JSON.stringify(fields);
  const autoCollectionsJson = autoCollections ? JSON.stringify(autoCollections) : null;

  const optionSet = await prisma.optionSet.upsert({
    where: { id: id ?? "__new__" },
    create: {
      ...fieldsData,
      fields: fieldsJson,
      autoCollections: autoCollectionsJson,
    },
    update: {
      ...fieldsData,
      fields: fieldsJson,
      autoCollections: autoCollectionsJson,
    },
  });

  if (assignments) {
    await prisma.optionSetAssignment.deleteMany({
      where: { optionSetId: optionSet.id },
    });

    if (assignments.length > 0) {
      await prisma.optionSetAssignment.createMany({
        data: assignments.map((productId) => ({
          optionSetId: optionSet.id,
          productId,
        })),
      });
    }
  }

  return prisma.optionSet.findUnique({
    where: { id: optionSet.id },
    include: { assignments: true },
  });
}

export async function deleteOptionSet(id: string) {
  await prisma.optionSet.delete({ where: { id } });
}

export async function getOptions() {
  return prisma.option.findMany({ orderBy: { title: "asc" } });
}

export async function getOption(id: string) {
  return prisma.option.findUnique({ where: { id } });
}

export async function saveOption(data: OptionInput) {
  const { id, options, ...fieldsData } = data;
  const optionsJson = options ? JSON.stringify(options) : null;

  return prisma.option.upsert({
    where: { id: id ?? "__new__" },
    create: { ...fieldsData, options: optionsJson },
    update: { ...fieldsData, options: optionsJson },
  });
}

export async function deleteOption(id: string) {
  await prisma.option.delete({ where: { id } });
}

const METAFIELDS_SET_MUTATION = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function assignConfiguratorToProduct(
  productId: string,
  optionSet: { id: string; fields: string },
  admin: ShopifyAdmin,
) {
  const ownerId = productId.startsWith("gid://shopify/")
    ? productId
    : `gid://shopify/Product/${productId}`;

  const result = await admin.graphql(METAFIELDS_SET_MUTATION, {
    variables: {
      metafields: [
        {
          ownerId,
          namespace: "$app",
          key: "configurator",
          type: "json",
          value: optionSet.fields,
        },
      ],
    },
  });

  const response = await result.json();
  const userErrors = response?.data?.metafieldsSet?.userErrors ?? [];

  if (userErrors.length > 0) {
    console.error(`[configurator] Failed to assign to product ${productId}:`, userErrors);
    throw new Error(`Metafield write failed: ${userErrors.map((e: { message: string }) => e.message).join(", ")}`);
  }

  console.log(`[configurator] Assigned optionSet ${optionSet.id} to product ${productId}`);
}

export async function syncManualAssignments(
  optionSet: {
    id: string;
    fields: string;
    assignments: { productId: string }[];
  },
  admin: ShopifyAdmin,
) {
  for (const assignment of optionSet.assignments) {
    await assignConfiguratorToProduct(assignment.productId, optionSet, admin);
  }
}