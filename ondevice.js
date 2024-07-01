const baseUrl = "http://localhost:3000";
let entities = [];
let mergeClusteringResponse = {};
let entitiesLock = false;
let clusteringLock = false;

export async function postRequest(endpoint, data) {
    try {
        const response = await fetch(`${baseUrl}/${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });
        return await response.json();
    } catch (error) {
        console.error(`Error decoding JSON response from ${endpoint}:`, error);
        return {};
    }
}

export function normalizeEntities(results) {
    console.log("clean entities");
    console.log(results);
    if (typeof results === "string") {
        try {
            results = JSON.parse(results);
            if (results.results) {
                return results.results;
            }
        } catch (error) {
            console.error("Error decoding JSON:", error);
        }
    }
    return results;
}

export async function detectEntities(userMessage) {
    const response = await postRequest("detect", { message: userMessage });
    console.log("Detect Response:", response);
    if (!entitiesLock) {
        entitiesLock = true;
        const normalizedResults = normalizeEntities(response.results || []);
        entities = entities.concat(normalizedResults);
        console.log("Entities updated from detect_entities.");
        entitiesLock = false;
        await mergeEntitiesResults();
    }
}

export async function nltkNer(userMessage) {
    const response = await postRequest("nltk-ner", { message: userMessage });
    console.log("NLTK NER Response:", response);
    if (!entitiesLock) {
        entitiesLock = true;
        const normalizedResults = normalizeEntities(response.results || []);
        entities = entities.concat(normalizedResults);
        console.log("Entities updated from nltk_ner.");
        entitiesLock = false;
        await mergeEntitiesResults();
    }
}

export async function generateEmbeddings() {
    console.log("Generating embeddings...");
    const response = await postRequest("generate-embeddings", {});
    console.log("Generate Embeddings Response:", response);
    return response;
}

export async function clusterUf() {
    console.log("Clustering UF...");
    const response = await postRequest("clusteruf", {});
    console.log("Cluster UF Response:", response);
    if (!clusteringLock) {
        clusteringLock = true;
        const ufResults = response.results || {};
        for (const key in ufResults) {
            if (ufResults[key].length > 4) continue;

            if (mergeClusteringResponse[key]) {
                if (mergeClusteringResponse[key].length > 3) continue;
                mergeClusteringResponse[key] = Array.from(new Set(mergeClusteringResponse[key].concat(ufResults[key])));
            } else {
                mergeClusteringResponse[key] = ufResults[key];
            }
        }
        clusteringLock = false;
        await mergeClusteringResponseUpdated();
    }
}

export async function cluster(userMessage) {
    console.log("Clustering...");
    const response = await postRequest("cluster", { message: userMessage });
    console.log("Cluster Response:", response);
    if (!clusteringLock) {
        clusteringLock = true;
        const clusterResults = JSON.parse(response.results || "{}");
        for (const key in clusterResults) {
            if (clusterResults[key].length > 4) continue;

            if (mergeClusteringResponse[key]) {
                continue;
            } else {
                mergeClusteringResponse[key] = clusterResults[key];
            }
        }
        clusteringLock = false;
        await mergeClusteringResponseUpdated();
    }
}

export async function mergeClusteringResponseUpdated() {
    console.log("Merged Clustering Response:", mergeClusteringResponse);
    const response = await postRequest("update-cluster-results", { results: mergeClusteringResponse });
    console.log("Update Clustering Response:", response);
}

export async function mergeEntitiesResults() {
    console.log("Merged Entities:", entities);
    const response = await postRequest("update-entities", { entities });
    console.log("Update Entities Response:", response);
    await triggerPostProcessing();
}

export async function triggerPostProcessing() {
    console.log("Trigger post processing");
    await generateEmbeddings();
    await clusterUf();
    await cluster(userMessage);
}


export async function getOnDeviceAbstractResponse(
  originalMessage,
  currentMessage,
  abstractList
) {
  const userMessage = `<Text>${currentMessage}</Text>\n<ProtectedInformation>${abstractList.join(
    ", "
  )}</ProtectedInformation>`;
  const response = await fetch("http://localhost:4000/abstract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: userMessage }),
  });
  const data = await response.json();
  const resultString = data.results;
  const jsonObject = JSON.parse(resultString);
  return jsonObject.results;
}
