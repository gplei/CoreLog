import Foundation
import Combine

struct Entry: Codable, Identifiable {
    let id: Int
    let entryDate: String
    let rawText: String
    let tags: [Tag]
    let photos: [Photo]
    let coverThumbnailPath: String?

    enum CodingKeys: String, CodingKey {
        case id
        case entryDate = "entry_date"
        case rawText = "raw_text"
        case tags
        case photos
        case coverThumbnailPath = "cover_thumbnail_path"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        entryDate = try container.decode(String.self, forKey: .entryDate)
        rawText = try container.decode(String.self, forKey: .rawText)
        tags = try container.decodeIfPresent([Tag].self, forKey: .tags) ?? []
        photos = try container.decodeIfPresent([Photo].self, forKey: .photos) ?? []
        coverThumbnailPath = try container.decodeIfPresent(String.self, forKey: .coverThumbnailPath)
    }
}

struct Tag: Codable, Hashable {
    let id: Int?
    let name: String
}

struct Photo: Codable, Identifiable {
    let id: Int
    let filePath: String
    let thumbnailPath: String?

    enum CodingKeys: String, CodingKey {
        case id
        case filePath = "file_path"
        case thumbnailPath = "thumbnail_path"
    }
}

struct EntriesResponse: Codable {
    let entries: [Entry]
}

enum CoreLogError: LocalizedError {
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "CoreLog returned an unexpected response."
        case let .server(message):
            return message
        }
    }
}

@MainActor
final class EntryStore: ObservableObject {
    @Published private(set) var entries: [Entry] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let client = CoreLogAPI()

    func loadEntries() async {
        isLoading = true
        defer { isLoading = false }

        do {
            entries = try await client.listEntries()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createEntry(text: String, tags: String) async -> Bool {
        do {
            let entry = try await client.createEntry(text: text, date: Self.today(), tags: tags)
            entries.insert(entry, at: 0)
            errorMessage = nil
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private static func today() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}
