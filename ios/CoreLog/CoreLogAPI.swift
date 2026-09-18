import Foundation

struct CoreLogAPI {
    // The iPhone and Mac must be on the same network for this local hostname to work.
    private static let serverURL = URL(string: "http://pingmac.local:3002")!
    private let baseURL = serverURL.appendingPathComponent("api")

    static func imageURL(path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        return serverURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    }

    func listEntries() async throws -> [Entry] {
        let (data, response) = try await URLSession.shared.data(from: baseURL.appendingPathComponent("entries"))
        try validate(response: response, data: data)
        return try JSONDecoder().decode(EntriesResponse.self, from: data).entries
    }

    func listTags(query: String) async throws -> [String] {
        var components = URLComponents(url: baseURL.appendingPathComponent("tags"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "search", value: query),
            URLQueryItem(name: "limit", value: "100"),
        ]
        let (data, response) = try await URLSession.shared.data(from: components.url!)
        try validate(response: response, data: data)
        return try JSONDecoder().decode(TagsResponse.self, from: data).tags
    }

    func createEntry(text: String, date: String, tags: String) async throws -> Entry {
        var request = URLRequest(url: baseURL.appendingPathComponent("entry"))
        request.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = multipartBody(boundary: boundary, fields: [
            "raw_text": text,
            "entry_date": date,
            "tags": tags,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)

        guard let id = try? JSONDecoder().decode(CreateEntryResponse.self, from: data).id else {
            throw CoreLogError.invalidResponse
        }
        return try await getEntry(id: id)
    }

    func addPhotos(to entry: Entry, images: [Data]) async throws -> Entry {
        var request = URLRequest(url: baseURL.appendingPathComponent("entries/\(entry.id)"))
        request.httpMethod = "PUT"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = multipartBody(boundary: boundary, fields: [
            "raw_text": entry.rawText,
            "entry_date": entry.entryDate,
            "tags": entry.tags.map(\.name).joined(separator: ", "),
        ], images: images)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return try await getEntry(id: entry.id)
    }

    func updateEntry(_ entry: Entry, text: String, tags: String) async throws -> Entry {
        var request = URLRequest(url: baseURL.appendingPathComponent("entries/\(entry.id)"))
        request.httpMethod = "PUT"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = multipartBody(boundary: boundary, fields: [
            "raw_text": text,
            "entry_date": entry.entryDate,
            "tags": tags,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return try await getEntry(id: entry.id)
    }

    func setCover(for entry: Entry, photo: Photo) async throws -> Entry {
        var request = URLRequest(url: baseURL.appendingPathComponent("entries/\(entry.id)/media-order"))
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let orderedIds = [photo.id] + entry.photos.filter { $0.id != photo.id }.map(\.id)
        request.httpBody = try JSONEncoder().encode(["ordered_media_ids": orderedIds])

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return try await getEntry(id: entry.id)
    }

    func deletePhoto(from entry: Entry, photo: Photo) async throws -> Entry {
        var request = URLRequest(url: baseURL.appendingPathComponent("entries/\(entry.id)/media/\(photo.id)"))
        request.httpMethod = "DELETE"
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return try await getEntry(id: entry.id)
    }

    func getEntry(id: Int) async throws -> Entry {
        let (data, response) = try await URLSession.shared.data(from: baseURL.appendingPathComponent("entries/\(id)"))
        try validate(response: response, data: data)
        return try JSONDecoder().decode(EntryResponse.self, from: data).entry
    }

    private func multipartBody(boundary: String, fields: [String: String], images: [Data] = []) -> Data {
        var body = Data()
        for (name, value) in fields {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".utf8))
            body.append(Data("\(value)\r\n".utf8))
        }
        for (index, image) in images.enumerated() {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"photos\"; filename=\"photo-\(index).jpg\"\r\n".utf8))
            body.append(Data("Content-Type: image/jpeg\r\n\r\n".utf8))
            body.append(image)
            body.append(Data("\r\n".utf8))
        }
        body.append(Data("--\(boundary)--\r\n".utf8))
        return body
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw CoreLogError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Request failed."
            throw CoreLogError.server(message)
        }
    }
}

private struct CreateEntryResponse: Codable {
    let id: Int
}

private struct EntryResponse: Codable {
    let entry: Entry
}

private struct TagsResponse: Codable {
    let tags: [String]
}
