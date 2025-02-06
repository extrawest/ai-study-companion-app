import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_chat_types/flutter_chat_types.dart' as types;
import 'package:flutter_chat_ui/flutter_chat_ui.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mime/mime.dart';
import 'package:simple_grid/simple_grid.dart';

import 'package:uuid/uuid.dart';

import '../../../common/consts.dart';
import '../bloc/chat_cubit.dart';
import '../utils/chat_utills.dart';
import '../widgets/custom_chat_bottom_widget.dart';

class ChatScreen extends StatelessWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ChatScreenContent();
  }
}

class ChatScreenContent extends StatefulWidget {
  const ChatScreenContent({super.key});

  @override
  State<ChatScreenContent> createState() => _ChatScreenContentState();
}

class _ChatScreenContentState extends State<ChatScreenContent> {
  @override
  void initState() {
    super.initState();
  }

  void _handleAttachmentPressed() {
    handleAttachmentPressed(
      context,
      onPhotoCallback: _handleImageSelection,
      onFileCallback: _handleFileSelection,
    );
  }

  Future<void> _handleFileSelection() async {
    final result = await FilePicker.platform.pickFiles();

    if (result != null && result.files.single.path != null) {
      final message = types.FileMessage(
        author: user,
        createdAt: DateTime.now().millisecondsSinceEpoch,
        id: const Uuid().v4(),
        mimeType: lookupMimeType(result.files.single.path!),
        name: result.files.single.name,
        size: result.files.single.size,
        uri: result.files.single.path!,
      );

      if (mounted) {
        context.read<ChatCubit>().addMessage(message);
        context.read<ChatCubit>().attachFile(result.files.single.path!);
      }
    }
  }

  Future<void> _handleImageSelection() async {
    final result = await ImagePicker().pickMultiImage(
      imageQuality: 70,
      maxWidth: 1440,
    );

    for (final image in result) {
      final bytes = await image.readAsBytes();
      final decodedImage = await decodeImageFromList(bytes);

      final message = types.ImageMessage(
        author: user,
        createdAt: DateTime.now().millisecondsSinceEpoch,
        height: decodedImage.height.toDouble(),
        id: const Uuid().v4(),
        name: image.name,
        size: bytes.length,
        uri: image.path,
        width: decodedImage.width.toDouble(),
      );
      if (mounted) {
        context.read<ChatCubit>().addMessage(message);
        context.read<ChatCubit>().attachFile(image.path);
      }
    }
  }

  Future<void> _handleMessageTap(BuildContext _, types.Message message) async {
    if (message is types.FileMessage) {
      context.read<ChatCubit>().handleMessageTap(message);
    }
  }

  void _handlePreviewDataFetched(
    types.TextMessage message,
    types.PreviewData previewData,
  ) {
    context.read<ChatCubit>().handlePreviewDataFetched(message, previewData);
  }

  Future<void> _handleSendPressed(types.PartialText message) async {
    context.read<ChatCubit>().sendMessage(message, user);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Ai Study Assistant'),
          leading: const SizedBox(),
        ),
        body: BlocBuilder<ChatCubit, ChatWidgetState>(
          builder: (context, state) {
            return LayoutBuilder(
              builder: (BuildContext context, BoxConstraints constraints) {
                return SpGrid(
                  width: MediaQuery.of(context).size.width,
                  alignment: WrapAlignment.center,
                  children: [
                    SpGridItem(
                      sm: 10,
                      md: 8,
                      lg: 6,
                      child: SizedBox(
                        height: constraints.maxHeight,
                        child: Column(
                          children: [
                            Expanded(
                              child: Chat(
                                messages: state.messages,
                                customBottomWidget: CustomChatBottomWidget(
                                  onAttachmentPressed: _handleAttachmentPressed,
                                ),
                                onMessageTap: _handleMessageTap,
                                onPreviewDataFetched: _handlePreviewDataFetched,
                                onSendPressed: _handleSendPressed,
                                showUserAvatars: true,
                                showUserNames: true,
                                user: user,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }
}
