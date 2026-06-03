import {
  type IRawURITransformer,
  type IURITransformer,
  URITransformer,
  type UriParts,
} from "./uriIpc.js";

function createRawURITransformer(remoteAuthority: string): IRawURITransformer {
  return {
    transformIncoming(uri: UriParts): UriParts {
      if (uri.scheme === "vscode-remote") {
        return { fragment: uri.fragment, path: uri.path, query: uri.query, scheme: "file" };
      }
      if (uri.scheme === "file") {
        return { fragment: uri.fragment, path: uri.path, query: uri.query, scheme: "vscode-local" };
      }
      return uri;
    },

    transformOutgoing(uri: UriParts): UriParts {
      if (uri.scheme === "file") {
        return {
          authority: remoteAuthority,
          fragment: uri.fragment,
          path: uri.path,
          query: uri.query,
          scheme: "vscode-remote",
        };
      }
      if (uri.scheme === "vscode-local") {
        return { fragment: uri.fragment, path: uri.path, query: uri.query, scheme: "file" };
      }
      return uri;
    },

    transformOutgoingScheme(scheme: string): string {
      if (scheme === "file") {
        return "vscode-remote";
      }
      if (scheme === "vscode-local") {
        return "file";
      }
      return scheme;
    },
  };
}

export function createURITransformer(remoteAuthority: string): IURITransformer {
  return new URITransformer(createRawURITransformer(remoteAuthority));
}
