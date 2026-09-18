import SwiftUI
import PhotosUI

private func formattedTags(_ value: String) -> String {
    let tags = value
        .split(separator: ",")
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    return tags.isEmpty ? "" : tags.joined(separator: ", ") + ", "
}

struct ContentView: View {
    @EnvironmentObject private var store: EntryStore
    @State private var showingNewEntry = false

    var body: some View {
        NavigationStack {
            Group {
                if store.isLoading && store.entries.isEmpty {
                    ProgressView("Loading CoreLog")
                } else if store.entries.isEmpty {
                    ContentUnavailableView("No entries", systemImage: "book.closed", description: Text("Create your first CoreLog entry."))
                } else {
                    List(store.entries) { entry in
                        NavigationLink {
                            EntryDetailView(entry: entry)
                        } label: {
                            EntryRow(entry: entry)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("CoreLog")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingNewEntry = true
                    } label: {
                        Label("New Entry", systemImage: "square.and.pencil")
                    }
                }
            }
            .refreshable {
                await store.loadEntries()
            }
            .task {
                if store.entries.isEmpty {
                    await store.loadEntries()
                }
            }
            .sheet(isPresented: $showingNewEntry) {
                NewEntryView()
            }
            .alert("CoreLog", isPresented: Binding(
                get: { store.errorMessage != nil },
                set: { if !$0 { store.errorMessage = nil } }
            )) {
                Button("OK") { store.errorMessage = nil }
            } message: {
                Text(store.errorMessage ?? "")
            }
        }
    }
}

private struct EntryRow: View {
    let entry: Entry

    var body: some View {
        HStack(spacing: 12) {
            if let imageURL = CoreLogAPI.imageURL(path: entry.coverThumbnailPath) {
                AsyncImage(url: imageURL) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.secondary.opacity(0.15)
                }
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(entry.rawText)
                    .lineLimit(3)
                HStack {
                    Text(entry.entryDate)
                    if !entry.tags.isEmpty {
                        Text(entry.tags.map(\.name).joined(separator: ", "))
                            .lineLimit(1)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }
}

private struct EntryDetailView: View {
    let entry: Entry
    @State private var loadedEntry: Entry?
    @State private var isLoading = false
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var isUploading = false
    @State private var photoError: String?
    @State private var selectedPhoto: Photo?
    @State private var showingEdit = false

    private var displayedEntry: Entry { loadedEntry ?? entry }

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 18) {
                Text(displayedEntry.entryDate)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(displayedEntry.rawText)
                    .font(.body)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !displayedEntry.tags.isEmpty {
                    Text(displayedEntry.tags.map(\.name).joined(separator: ", "))
                        .font(.subheadline)
                        .foregroundStyle(.tint)
                }
                PhotoGallery(photos: displayedEntry.photos) { photo in
                    selectedPhoto = photo
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .scrollIndicators(.visible)
        .navigationTitle("Entry")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selectedPhoto) { photo in
            VStack(spacing: 12) {
                if photo.id != displayedEntry.photos.first?.id {
                    Button("Set as Cover") {
                        selectedPhoto = nil
                        Task { await setCover(photo) }
                    }
                    .buttonStyle(.borderedProminent)
                }
                Button("Delete", role: .destructive) {
                    selectedPhoto = nil
                    Task { await deletePhoto(photo) }
                }
                Button("Cancel") { selectedPhoto = nil }
            }
            .padding()
            .presentationDetents([.height(180)])
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 10, matching: .images) {
                    Image(systemName: "photo.badge.plus")
                }
                .disabled(isUploading)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingEdit = true
                } label: {
                    Image(systemName: "pencil")
                }
                .disabled(isUploading)
            }
        }
        .overlay {
            if isLoading && loadedEntry == nil { ProgressView() }
        }
        .task {
            guard loadedEntry == nil else { return }
            isLoading = true
            loadedEntry = try? await CoreLogAPI().getEntry(id: entry.id)
            isLoading = false
        }
        .task(id: selectedPhotos) {
            guard !selectedPhotos.isEmpty else { return }
            isUploading = true
            let images = await withTaskGroup(of: Data?.self, returning: [Data].self) { group in
                for item in selectedPhotos {
                    group.addTask { try? await item.loadTransferable(type: Data.self) }
                }
                var result: [Data] = []
                for await image in group {
                    if let image { result.append(image) }
                }
                return result
            }
            if !images.isEmpty {
                do {
                    loadedEntry = try await CoreLogAPI().addPhotos(to: displayedEntry, images: images)
                } catch {
                    photoError = error.localizedDescription
                }
            } else {
                photoError = "The selected photos could not be loaded."
            }
            selectedPhotos = []
            isUploading = false
        }
        .alert("Photo Error", isPresented: Binding(
            get: { photoError != nil },
            set: { if !$0 { photoError = nil } }
        )) {
            Button("OK") { photoError = nil }
        } message: {
            Text(photoError ?? "")
        }
        .sheet(isPresented: $showingEdit) {
            EditEntryView(entry: displayedEntry) { updatedEntry in
                loadedEntry = updatedEntry
                showingEdit = false
            }
        }
    }

        private func setCover(_ photo: Photo) async {
            isUploading = true
            do {
                loadedEntry = try await CoreLogAPI().setCover(for: displayedEntry, photo: photo)
            } catch {
                photoError = error.localizedDescription
            }
            selectedPhoto = nil
            isUploading = false
        }

        private func deletePhoto(_ photo: Photo) async {
            isUploading = true
            do {
                loadedEntry = try await CoreLogAPI().deletePhoto(from: displayedEntry, photo: photo)
            } catch {
                photoError = error.localizedDescription
            }
            selectedPhoto = nil
            isUploading = false
        }
}

private struct EditEntryView: View {
    let entry: Entry
    let onSave: (Entry) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text: String
    @State private var tags: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var tagSuggestions: [String] = []

    init(entry: Entry, onSave: @escaping (Entry) -> Void) {
        self.entry = entry
        self.onSave = onSave
        _text = State(initialValue: entry.rawText)
        _tags = State(initialValue: formattedTags(entry.tags.map(\.name).joined(separator: ", ")))
    }

    private var currentTagQuery: String {
        tags.split(separator: ",").last.map(String.init)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Description") {
                    TextEditor(text: $text)
                        .frame(minHeight: 180)
                }
                Section("Tags") {
                    TextField("family, travel", text: $tags)
                        .textInputAutocapitalization(.never)
                    if !tagSuggestions.isEmpty {
                        ForEach(tagSuggestions, id: \.self) { suggestion in
                            Button(suggestion) {
                                let prefix = tags.split(separator: ",").dropLast().map(String.init)
                                tags = formattedTags((prefix + [suggestion]).joined(separator: ", "))
                                tagSuggestions = []
                            }
                            .foregroundStyle(.primary)
                        }
                    }
                }
            }
            .navigationTitle("Edit Entry")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            isSaving = true
                            do {
                                let updatedEntry = try await CoreLogAPI().updateEntry(
                                    entry,
                                    text: text,
                                    tags: formattedTags(tags),
                                )
                                onSave(updatedEntry)
                            } catch {
                                errorMessage = error.localizedDescription
                            }
                            isSaving = false
                        }
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
            .overlay {
                if isSaving { ProgressView().controlSize(.large) }
            }
            .task(id: currentTagQuery) {
                guard !currentTagQuery.isEmpty else {
                    tagSuggestions = []
                    return
                }
                try? await Task.sleep(for: .milliseconds(150))
                guard !Task.isCancelled else { return }
                tagSuggestions = (try? await CoreLogAPI().listTags(query: currentTagQuery)) ?? []
            }
            .alert("Save Error", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }
}

private struct PhotoGallery: View {
    let photos: [Photo]
    let onPhotoTap: (Photo) -> Void

    var body: some View {
        Group {
            if !photos.isEmpty {
                ScrollView(.horizontal, showsIndicators: true) {
                    LazyHStack(spacing: 12) {
                        ForEach(photos) { photo in
                            PhotoTile(photo: photo) { onPhotoTap(photo) }
                        }
                    }
                }
                .frame(height: 300)
            }
        }
    }
}

private struct PhotoTile: View {
    let photo: Photo
    let onTap: () -> Void

    var body: some View {
        Group {
            if let imageURL = CoreLogAPI.imageURL(path: photo.filePath) {
                AsyncImage(url: imageURL) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    ProgressView()
                }
                .frame(width: 300, height: 300)
                .background(Color.secondary.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .contentShape(RoundedRectangle(cornerRadius: 10))
                .onTapGesture { onTap() }
            }
        }
    }
}

private struct NewEntryView: View {
    @EnvironmentObject private var store: EntryStore
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var tags = ""
    @State private var tagSuggestions: [String] = []
    @State private var isSaving = false

    private var currentTagQuery: String {
        tags.split(separator: ",").last.map(String.init)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Entry") {
                    TextEditor(text: $text)
                        .frame(minHeight: 160)
                }
                Section("Tags") {
                    TextField("family, travel", text: $tags)
                        .textInputAutocapitalization(.never)
                    if !tagSuggestions.isEmpty {
                        ForEach(tagSuggestions, id: \.self) { suggestion in
                            Button(suggestion) {
                                let prefix = tags.split(separator: ",").dropLast().map(String.init)
                                tags = (prefix + [suggestion]).joined(separator: ", ") + ", "
                                tagSuggestions = []
                            }
                            .foregroundStyle(.primary)
                        }
                    }
                }
            }
            .navigationTitle("New Entry")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            isSaving = true
                            if await store.createEntry(text: text, tags: formattedTags(tags)) {
                                dismiss()
                            }
                            isSaving = false
                        }
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
            .overlay {
                if isSaving { ProgressView().controlSize(.large) }
            }
            .task(id: currentTagQuery) {
                guard !currentTagQuery.isEmpty else {
                    tagSuggestions = []
                    return
                }
                try? await Task.sleep(for: .milliseconds(150))
                guard !Task.isCancelled else { return }
                tagSuggestions = (try? await CoreLogAPI().listTags(query: currentTagQuery)) ?? []
            }
        }
    }
}
