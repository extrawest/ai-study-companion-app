import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:simple_grid/simple_grid.dart';
import '../../../common/pages/home_page.dart';
import '../../../network/utils/network_util.dart';
import '../bloc/creds_cubit.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocListener<CredsCubit, CredsState>(
      listener: (context, state) {
        if (state.status == LoadingStatus.success) {
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (context) => const HomePage(),
            ),
          );
        }
      },
      child: BlocBuilder<CredsCubit, CredsState>(
        builder: (context, state) {
          return SafeArea(
            child: Scaffold(
              appBar: AppBar(
                title: const Text('Ai Study Assistant'),
              ),
              body: LayoutBuilder(
                builder: (BuildContext context, BoxConstraints constraints) {
                  return SpGrid(
                    width: MediaQuery.of(context).size.width,
                    alignment: WrapAlignment.center,
                    children: [
                      SpGridItem(
                        sm: 10,
                        md: 8,
                        lg: 6,
                        decoration: const BoxDecoration(color: Colors.white),
                        child: SizedBox(
                          height: constraints.maxHeight,
                          child: Column(
                            children: [
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.all(16.0),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        'Welcome',
                                        style: Theme.of(context)
                                            .textTheme
                                            .headlineLarge,
                                      ),
                                      const SizedBox(
                                        height: 15,
                                      ),
                                      Text(
                                        'Please enter your credentials to start using the app',
                                        style: Theme.of(context)
                                            .textTheme
                                            .headlineSmall,
                                        textAlign: TextAlign.center,
                                      ),
                                      const SizedBox(
                                        height: 30,
                                      ),
                                      _buildTextField(
                                        label: 'OpenAI Key',
                                        onChanged: (value) => context
                                            .read<CredsCubit>()
                                            .updateOpenAiKey(value),
                                      ),
                                      const SizedBox(height: 16),
                                      _buildTextField(
                                        label: 'Pinecone API Key',
                                        onChanged: (value) => context
                                            .read<CredsCubit>()
                                            .updatePineconeApiKey(value),
                                      ),
                                      const SizedBox(height: 16),
                                      _buildTextField(
                                        label: 'Pinecone Index Name',
                                        onChanged: (value) => context
                                            .read<CredsCubit>()
                                            .updatePineconeIndexName(value),
                                      ),
                                      const SizedBox(height: 16),
                                    ],
                                  ),
                                ),
                              ),
                              _buildSubmitButton(context, state),
                              if (state.status == LoadingStatus.failure)
                                _buildErrorText(state.error),
                            ],
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildTextField({
    required String label,
    required ValueChanged<String> onChanged,
  }) {
    return TextField(
      onChanged: onChanged,
      obscureText: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
    );
  }

  Widget _buildSubmitButton(BuildContext context, CredsState state) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed:

        state.openAiKey.isNotEmpty &&
                state.pineconeApiKey.isNotEmpty &&
                state.pineconeIndexName.isNotEmpty
            ? () => context.read<CredsCubit>().submitCreds()
            : null,
        style: ElevatedButton.styleFrom(
          shape: const RoundedRectangleBorder(),
          backgroundColor: Colors.blue,
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
        child: const Text(
          'Start Quiz',
          style: TextStyle(color: Colors.white),
        ),
      ),
    );
  }

  Widget _buildErrorText(String? error) {
    return Text(
      error ?? 'An error occurred',
      style: const TextStyle(color: Colors.red),
    );
  }
}
