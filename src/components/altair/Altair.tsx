/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { type FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { useEffect, memo, useState } from "react";
import './altair.scss';
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ToolCall } from "../../multimodal-live-types";

// Define the function declaration for the Discovery Engine search tool
const search_discovery_engine: FunctionDeclaration = {
  name: "search_discovery_engine",
  description:
    "Searches the Traveloka hotel database using Google Discovery Engine based on a user query.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: "The search term or query to use for finding hotels.",
      },
    },
    required: ["query"],
  },
};

function AltairComponent() {
  const { client, setConfig } = useLiveAPIContext();
  const [hotelResults, setHotelResults] = useState<any[] | null>(null);

  // Configure the Live API client with the Discovery Engine tool
  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp", // Or your preferred model
      generationConfig: {
        responseModalities: "audio", // Or your preferred modality
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }, // Or your preferred voice
        },
      },
      systemInstruction: {
        parts: [
          {
            text: 'You are a helpful travel assistant. When asked to search for hotels, use the "search_discovery_engine" function.',
          },
        ],
      },
      tools: [
        // Include the Discovery Engine function declaration
        { functionDeclarations: [search_discovery_engine] },
        // You can include other tools like Google Search if needed
        { googleSearch: {} },
      ],
    });
  }, [setConfig]);

  // Handle incoming tool calls from Gemini
  useEffect(() => {
    const onToolCall = async (toolCall: ToolCall) => {
      console.log(`Received tool call:`, toolCall);

      // Find the specific function call for Discovery Engine search
      const call = toolCall.functionCalls.find(
        (fc) => fc.name === search_discovery_engine.name,
      );

      if (call) {
        console.log(`Executing function call: ${call.name}`);
        const { query } = call.args as { query: string };

        // Retrieve the access token from environment variables
        const accessToken = process.env.REACT_APP_DISCOVERY_ENGINE_ACCESS_TOKEN;
        const placeholderToken = "YOUR_ACCESS_TOKEN_HERE"; // Define the placeholder

        // --- Error Handling: Check for missing or placeholder token ---
        if (!accessToken || accessToken === placeholderToken) {
          console.error(
            "Discovery Engine Access Token is missing or invalid in .env file.",
          );
          const errorResponse = {
            error: "Configuration Error",
            message:
              "Discovery Engine Access Token is missing or is still the placeholder value. Please update the .env file.",
          };
          client.sendToolResponse({ functionResponses: [{ id: call.id, response: errorResponse }] });
          return; // Stop execution if token is invalid
        }

        // Construct the API request body
        const requestBody = {
          query: query,
          pageSize: 5, // Adjust as needed
          queryExpansionSpec: {
            condition: "AUTO",
          },
          spellCorrectionSpec: {
            mode: "AUTO",
          },
          contentSearchSpec: {
            snippetSpec: {
              returnSnippet: true,
            },
            summarySpec: {
              summaryResultCount: 5,
              includeCitations: true,
            },
            extractiveContentSpec: {
              maxExtractiveAnswerCount: 1,
            },
          },
        };

        const apiUrl =
          "https://discoveryengine.googleapis.com/v1alpha/projects/1018963165306/locations/global/collections/default_collection/engines/traveloka-augmented-search_1746094176671/servingConfigs/default_search:search";

        try {
          // --- Make the API call ---
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          });

          // --- Handle API Response ---
          if (!response.ok) {
            // Attempt to parse error details from the API response
            let errorDetails = `API returned status: ${response.status}`;
            try {
              const errorData = await response.json();
              errorDetails += ` - ${JSON.stringify(errorData)}`;
            } catch (parseError) {
              errorDetails += " - Failed to parse error response body.";
            }
            console.error("Discovery Engine API call failed:", errorDetails);
            client.sendToolResponse({ functionResponses: [{ id: call.id, response: { error: "API Call Failed", details: errorDetails } }] });
          } else {
            // --- Success: Send results back to Gemini ---
            const results = await response.json();
            console.log('API Results Received:', JSON.stringify(results, null, 2)); // Added log 1
            console.log("Discovery Engine API call successful, sending results:", results);

            // Update state with hotel results before sending response
            // Added log 2
            setHotelResults(results?.results || []); // Directly use results.results, fallback to empty array
            console.log('Attempting to set hotelResults state with:', JSON.stringify(results?.results, null, 2)); // Log after setting state

            // Send the successful results back, wrapped correctly
            client.sendToolResponse({ functionResponses: [{ id: call.id, response: { output: results } }] });
          }
        } catch (error) {
          // --- Handle Network/Fetch Errors ---
          console.error("Error during Discovery Engine API call:", error);
          client.sendToolResponse({ functionResponses: [{ id: call.id, response: { error: "Network or Fetch Error", message: error instanceof Error ? error.message : String(error) } }] });
        }
      } else {
        // Handle cases where the tool call is not for search_discovery_engine
        // (e.g., if other tools were also called)
        console.warn("Received tool call for an unhandled function:", toolCall);
        // Optionally send a generic response or error for unhandled calls
      }
    };

    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client]); // Removed sendToolResponse dependency

  // This component no longer renders anything directly.
  // Gemini will handle the response based on the tool results.
  return (
    <>
      {/* Existing UI elements would go here if there were any */}
      {hotelResults && hotelResults.length > 0 && (
          <div className="hotel-results-container">
              <h3>Hotel Search Results:</h3>
                {/* Added log 3 - Log and return null to satisfy ReactNode type */}
                {(() => { console.log('Rendering hotelResults:', hotelResults); return null; })()}
              {hotelResults.map((result) => (
                  <div key={result.id} className="hotel-card">
                      {/* Image */}
                      {result.document?.structData?.hotel_image && (
                          <img src={result.document.structData.hotel_image} alt={result.document.structData.hotel_name} className="hotel-image" />
                      )}
                      <div className="hotel-info">
                          {/* Name */}
                          <h4>{result.document?.structData?.hotel_name || 'N/A'}</h4>
                          {/* Rating */}
                          <p className="hotel-rating">Rating: {result.document?.structData?.star_rating || 'N/A'} stars</p>
                          {/* Amenities Tags */}
                          {result.document?.structData?.amenities && result.document.structData.amenities.length > 0 && (
                              <div className="amenities-tags">
                                  {result.document.structData.amenities.slice(0, 4).map((amenity: string, index: number) => ( // Show first 4 amenities
                                      <span key={index} className="amenity-tag">{amenity}</span>
                                  ))}
                              </div>
                          )}
                          {/* Price */}
                          <p className="hotel-price">{result.document?.structData?.final_price ? `IDR ${result.document.structData.final_price}` : 'Price N/A'}</p>
                          {/* Removed: Full Address, Full Description, Full Amenity List */}
                      </div>
                  </div>
              ))}
          </div>
      )}
    </>
  );
}

export const Altair = memo(AltairComponent);
