import { Client, PageIterator, PageCollection } from "@microsoft/microsoft-graph-client";
import { logger } from "./logger.js";

/**
 * Shared GET executor for Microsoft Graph API queries.
 * Used by both the Entra and Defender tool modules.
 */
export async function executeGraphGet(
  toolName: string,
  path: string,
  queryParams: Record<string, string> | undefined,
  graphApiVersion: "v1.0" | "beta",
  fetchAll: boolean,
  consistencyLevel: string | undefined,
  graphClient: Client | null,
) {
  if (!graphClient) {
    return {
      content: [{ type: "text" as const, text: "Graph client not initialized. Authentication may have failed." }],
      isError: true,
    };
  }

  logger.info(`${toolName}: GET ${path} (version=${graphApiVersion}, fetchAll=${fetchAll})`);

  try {
    let request = graphClient.api(path).version(graphApiVersion);

    if (queryParams && Object.keys(queryParams).length > 0) {
      request = request.query(queryParams);
    }
    if (consistencyLevel) {
      request = request.header("ConsistencyLevel", consistencyLevel);
    }

    let responseData: any;

    if (fetchAll) {
      const firstPage: PageCollection = await request.get();
      const context = firstPage["@odata.context"];
      const allItems: any[] = firstPage.value || [];
      const pageIterator = new PageIterator(graphClient, firstPage, (item: any) => {
        allItems.push(item);
        return true;
      });
      await pageIterator.iterate();
      responseData = { "@odata.context": context, value: allItems };
      logger.info(`${toolName}: fetched all pages, total items: ${allItems.length}`);
    } else {
      responseData = await request.get();
    }

    let text = `Result for ${toolName} (${graphApiVersion}) — GET ${path}:\n\n`;
    text += JSON.stringify(responseData, null, 2);

    if (!fetchAll && responseData?.["@odata.nextLink"]) {
      text += "\n\nNote: More results available. Set fetchAll to true to retrieve all pages.";
    }

    return { content: [{ type: "text" as const, text }] };
  } catch (error: any) {
    logger.error(`${toolName} error (path=${path}):`, error);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          error: error.message || String(error),
          statusCode: error.statusCode || "N/A",
          body: error.body ?? "N/A",
        }),
      }],
      isError: true,
    };
  }
}
